import { Role } from '@prisma/client';

export interface AuthUser {
  id: string;
  merchantId: string;
  storeId: string | null;
  role: Role;
}
