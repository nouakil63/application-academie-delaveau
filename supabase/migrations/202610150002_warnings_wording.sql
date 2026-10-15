-- Les « observations » mensuelles sont désormais présentées comme des avertissements.
drop trigger if exists on_monthly_observation_created on public.monthly_observations;
create trigger on_monthly_observation_created after insert on public.monthly_observations
for each row execute procedure public.notify_student_tracking('monthly','Nouvel avertissement','Un avertissement a été ajouté à votre suivi.');
