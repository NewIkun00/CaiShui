import type{ReviewRiskLevel,ReviewSourceType}from'./review-case-store.js';
export interface ResolvedReviewSource{readonly riskLevel:ReviewRiskLevel;readonly blocksFiling:boolean;readonly summary:string;readonly createdBy:string}
export const REVIEW_SOURCE_RESOLVER=Symbol('REVIEW_SOURCE_RESOLVER');
export interface ReviewSourceResolver{resolve(tenantId:string,companyId:string,sourceType:ReviewSourceType,sourceId:string):Promise<ResolvedReviewSource|null>;documentsExist(tenantId:string,companyId:string,documentIds:readonly string[]):Promise<boolean>}
