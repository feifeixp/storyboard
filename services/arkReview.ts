import { API_BASE_URL, getAccessToken } from './auth';

export interface ArkAssetReviewReq {
  imageUrl: string;
}

export interface ArkAssetReviewRes {
  fileName: string;
  imageUrl: string;
  groupName: string;
  arkAssetId: string;
  reviewStatus: number; // 0-待审核、1-审核中、2-审核通过、3-审核失败
  reviewStatusDesc: string;
  taskStatus: number; // 0-待处理、1-创建分组中、2-创建资产中、3-处理完成、4-失败
  errorMessage: string | null;
  existed: boolean;
}

export interface SingleResponse<T> {
  success: boolean;
  data: T;
  errCode: string | null;
  errMessage: string | null;
}


/**
 * 提交图片到 Ark 平台进行真人审核
 * @param req 请求参数，包含 imageUrl
 * @returns 审核响应结果
 */
export async function submitArkAssetReview(req: ArkAssetReviewReq): Promise<ArkAssetReviewRes> {
  const token = getAccessToken();
  if (!token) {
    throw new Error('未登录或 token 已过期');
  }

  const WORKER_API_BASE = 'https://visionary-storyboard-skill-api.feifeixp.workers.dev';
  const response = await fetch(`${WORKER_API_BASE}/api/v1/auth/ark-asset-review/submit`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'accessToken': token,
    },
    body: JSON.stringify(req),
  });

  if (!response.ok) {
    let errMsg = '提交审核请求失败';
    try {
      const errData = await response.json();
      errMsg = errData.errMessage || errData.message || errMsg;
    } catch (e) {
      // json parse error
    }
    throw new Error(errMsg);
  }

  const result: SingleResponse<ArkAssetReviewRes> = await response.json();
  if (!result.success) {
    throw new Error(result.errMessage || '提交审核请求失败');
  }

  return result.data;
}
