import { useState, useEffect } from 'react';
import { isLoggedIn, getUserPoints, type PointsInfo } from '../../services/auth';

export function useAuth() {
  const [loggedIn, setLoggedIn] = useState(() => isLoggedIn());
  const [userPoints, setUserPoints] = useState<PointsInfo | null>(null);

  // 获取用户积分信息（登录时初始化）
  useEffect(() => {
    // 监听全局凭证过期事件
    const handleAuthExpired = () => {
      setLoggedIn(false);
      setUserPoints(null);
      alert('登录凭证已过期,请重新登录');
    };
    window.addEventListener('auth-expired', handleAuthExpired);

    if (loggedIn) {
      const fetchPoints = async () => {
        try {
          const points = await getUserPoints();
          setUserPoints(points);
        } catch (error: any) {
          console.error('[App] 获取积分信息失败:', error);
          if (error.message?.includes('凭证过期') || error.message?.includes('Token has been revoked')) {
            handleAuthExpired();
          }
        }
      };
      fetchPoints();
    }

    return () => {
      window.removeEventListener('auth-expired', handleAuthExpired);
    };
  }, [loggedIn]);

  return { loggedIn, setLoggedIn, userPoints, setUserPoints };
}
