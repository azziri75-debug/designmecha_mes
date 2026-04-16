self.addEventListener('push', function(event) {
    if (event.data) {
        try {
            const data = event.data.json();
            const options = {
                body: data.body || '새로운 알림이 도착했습니다.',
                icon: data.icon || '/vite.svg',
                badge: '/vite.svg',
                vibrate: [100, 50, 100],
                data: {
                    url: data.url || '/'
                }
            };
            
            event.waitUntil(
                self.registration.showNotification(data.title || '알림', options)
            );
        } catch (e) {
            console.error('Push data is not JSON:', e);
            event.waitUntil(
                self.registration.showNotification('알림', {
                    body: event.data.text()
                })
            );
        }
    }
});

self.addEventListener('notificationclick', function(event) {
    event.notification.close();
    
    // 알림 클릭 시 지정된 URL로 이동
    const urlToOpen = new URL(event.notification.data.url, self.location.origin).href;
    
    event.waitUntil(
        clients.matchAll({
            type: 'window',
            includeUncontrolled: true
        }).then(function(windowClients) {
            let matchingClient = null;
            for (let i = 0; i < windowClients.length; i++) {
                const windowClient = windowClients[i];
                if (windowClient.url === urlToOpen) {
                    matchingClient = windowClient;
                    break;
                }
            }
            if (matchingClient) {
                return matchingClient.focus();
            } else {
                return clients.openWindow(urlToOpen);
            }
        })
    );
});
