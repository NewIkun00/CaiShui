import { SetMetadata } from '@nestjs/common';

export const STEP_UP_REQUIRED = 'ledgerly.step-up-required';
export const RequireStepUp = () => SetMetadata(STEP_UP_REQUIRED, true);
