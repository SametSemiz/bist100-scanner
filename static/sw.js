const CACHE_NAME = 'bbawe-scanner-v1';

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  // PWA şartlarını sağlamak için basit bir fetch dinleyicisi
});
