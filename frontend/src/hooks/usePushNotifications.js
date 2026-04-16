import { useEffect, useRef } from 'react';
import api from '../lib/api';

// Base64Url 디코딩 유틸리티
// ... (omitted same part) ...
                // 3. 백엔드에서 VAPID Public Key 가져오기
                // 프론트엔드 .env 또는 백엔드 API에서 읽어옵니다.
                let publicKey = import.meta.env.VITE_VAPID_PUBLIC_KEY;
                if (!publicKey || publicKey.includes('YOUR_VAPID') || publicKey === '""' || publicKey === "''") {
                     const response = await api.get('/notifications/vapid-public-key');
                     publicKey = response.data.public_key;
                }
// ... (omitted same part) ...
                console.log('Syncing push subscription with server...');
                await api.post('/notifications/subscribe', subData);
                console.log('Push subscription synced');

                isSubscribedRef.current = true;

            } catch (error) {
                console.error('Push notification registration failed', error);
            }
        };

        // 약간의 지연 후에 구독 로직 실행 (화면 렌더링 방해 방지)
        setTimeout(registerPush, 2000);

    }, [userId]);
}
