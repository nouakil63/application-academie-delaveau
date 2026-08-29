alter table public.absence_requests
add column if not exists equestrian_course_status text
check (equestrian_course_status in ('maintained','not_maintained'));

create or replace function public.notify_absence_reviewed()
returns trigger language plpgsql security definer set search_path=public
as $$
declare
  owner_id uuid;
  response_title text;
  response_body text;
begin
  if new.status is distinct from old.status and new.status in ('approved','rejected') then
    response_title := case
      when new.request_type='delay' and new.status='approved' then 'Retard accepté'
      when new.request_type='delay' then 'Retard refusé'
      when new.status='approved' then 'Absence acceptée'
      else 'Absence refusée'
    end;
    response_body := 'Votre demande du '||to_char(new.absence_date,'DD/MM/YYYY')||' a été '||
      case when new.status='approved' then 'acceptée' else 'refusée' end||
      coalesce(' par '||new.reviewed_by_name,'')||'. '||
      case when new.equestrian_course_status='maintained'
        then 'Le cours avec votre cheval est maintenu.'
        when new.equestrian_course_status='not_maintained'
        then 'Vous ne participerez pas au cours avec votre cheval.'
        else 'La participation au cours équestre reste à confirmer.' end||
      case when nullif(new.review_comment,'') is not null then ' Commentaire : '||new.review_comment else '' end;
    select user_id into owner_id from public.students where id=new.student_id;
    if owner_id is not null then
      insert into public.notifications(recipient_id,student_id,absence_request_id,kind,title,body)
      values(owner_id,new.student_id,new.id,'absence_response',response_title,response_body);
    end if;
    insert into public.notifications(recipient_id,student_id,absence_request_id,kind,title,body)
    select ps.parent_id,new.student_id,new.id,'absence_response',response_title,response_body
    from public.parent_students ps where ps.student_id=new.student_id;
  end if;
  return new;
end;
$$;
