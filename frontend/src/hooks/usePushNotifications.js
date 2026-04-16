import { useEffect, useRef } from 'react';
import axios from 'axios';

// Base64Url 디코딩 유틸리티
function urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding)
        .replace(/\-/g, '+')
        .replace(/_/g, '/');

    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);

    for (let i = 0; i < rawData.length; ++i) {
        outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
}

export default function usePushNotifications(userId) {
    const isSubscribedRef = useRef(false);

    useEffect(() => {
        if (!userId) return;
        
        // 브라우저 지원 여부 확인
        if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
            console.log('Push messaging is not supported');
            return;
        }

        const registerPush = async () => {
            if (isSubscribedRef.current) return;
            
            try {
                // 1. 서비스 워커 등록
                const registration = await navigator.serviceWorker.register('/sw.js');
                console.log('Service Worker registered');

                // 2. 권한 확인 (사용자에게 알림 권한 프롬프트 표시)
                const permission = await window.Notification.requestPermission();
                if (permission !== 'granted') {
                    console.log('Push permission denied');
                    return;
                }

                // 3. 백엔드에서 VAPID Public Key 가져오기
                // 프론트엔드 .env 또는 백엔드 API에서 읽어옵니다.
                let publicKey = import.meta.env.VITE_VAPID_PUBLIC_KEY;
                if (!publicKey || publicKey.includes('YOUR_VAPID') || publicKey === '""' || publicKey === "''") {
                     const response = await axios.get('/api/v1/notifications/vapid-public-key');
                     publicKey = response.data.public_key;
                }

                if (!publicKey || publicKey === '""' || publicKey === '') {
                    console.log('No valid VAPID Public Key found');
                    return;
                }
                
                // .env에 따옴표가 그대로 문자열로 들어가는 것을 방지
                publicKey = publicKey.replace(/['"]/g, '').trim();

                // 4. Push 구독
                const applicationServerKey = urlBase64ToUint8Array(publicKey);
                let subscription = await registration.pushManager.getSubscription();

                if (!subscription) {
                    subscription = await registration.pushManager.subscribe({
                        userVisibleOnly: true,
                        applicationServerKey: applicationServerKey
                    });
                }

                // 5. 서버로 구독 정보 전송
                const p256dh = btoa(String.fromCharCode.apply(null, new Uint8Array(subscription.getKey('p256dh'))));
                const auth = btoa(String.fromCharCode.apply(null, new Uint8Array(subscription.getKey('auth'))));

                const subData = {
                    endpoint: subscription.endpoint,
                    p256dh: p256dh.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''),
                    auth: auth.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
                };

                await axios.post('/api/v1/notifications/subscribe', subData);
                console.log('Push subscription sent to server');
                isSubscribedRef.current = true;

            } catch (error) {
                console.error('Push notification registration failed', error);
            }
        };

        // 약간의 지연 후에 구독 로직 실행 (화면 렌더링 방해 방지)
        setTimeout(registerPush, 2000);

    }, [userId]);
}
