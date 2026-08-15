// Shared ledgers use the explicitly authorized production CloudBase environment.
// Local ledgers still stay on-device unless the user chooses “创建共享账单”.
export const CLOUD_ENV_ID = 'cloud1-d3gbdocpk8fcb2e97'
export const SHARED_ROOMS_ENABLED = Boolean(CLOUD_ENV_ID)
