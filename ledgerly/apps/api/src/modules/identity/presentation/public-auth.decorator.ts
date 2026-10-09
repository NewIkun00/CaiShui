import { SetMetadata } from '@nestjs/common';

export const PUBLIC_AUTH_ROUTE = 'ledgerly.public-auth-route';
export const PublicAuth = () => SetMetadata(PUBLIC_AUTH_ROUTE, true);
