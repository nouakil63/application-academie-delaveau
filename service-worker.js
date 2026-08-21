const CACHE = "academie-delaveau-v21";
const ASSETS = ["/", "/manifest.webmanifest?v=16", "/assets/logo-academie-delaveau.png"];

self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener("activate", event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key)))));
  self.clients.claim();
});

self.addEventListener("fetch", event => {
  if (event.request.method !== "GET") return;
  if (new URL(event.request.url).origin !== self.location.origin) return;
  event.respondWith(
    fetch(event.request)
      .then(response => {
        if(response.ok){const copy = response.clone();caches.open(CACHE).then(cache => cache.put(event.request, copy));}
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});

self.addEventListener("push",event=>{
  const data=event.data?.json?.()||{};
  event.waitUntil(self.registration.showNotification(data.title||"Académie Delaveau",{
    body:data.body||"Vous avez une nouvelle alerte.",
    icon:"/assets/logo-academie-delaveau.png",
    badge:"/assets/logo-academie-delaveau.png",
    data:{url:data.url||"/"},
    tag:data.tag||"academie-alert",
    renotify:true
  }));
});

self.addEventListener("notificationclick",event=>{
  event.notification.close();
  event.waitUntil(clients.matchAll({type:"window",includeUncontrolled:true}).then(items=>{
    const existing=items.find(client=>new URL(client.url).origin===self.location.origin);
    return existing?existing.focus():clients.openWindow(event.notification.data?.url||"/");
  }));
});
