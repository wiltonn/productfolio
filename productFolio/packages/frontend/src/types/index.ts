// Initiative status enum
export type InitiativeStatus =
  | 'DRAFT'
  | 'PENDING_APPROVAL'
  | 'APPROVED'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'ON_HOLD'
  | 'CANCELLED';

// User types
export interface User {
  id: string;
  email: string;
  name: string;
  role: 'ADMIN' | 'PRODUCT_OWNER' | 'BUSINESS_OWNER' | 'RESOURCE_MANAGER' | 'VIEWER';
  createdAt: string;
  updatedAt: string;
}

// Initiative types
export interface Initiative {
  id: string;
  title: string;
  description: string | null;
  businessOwnerId: string;
  productOwnerId: string;
  status: InitiativeStatus;
  targetQuarter: string | null;
  customFields: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
  // Relations (optional, depends on includes)
  businessOwner?: User;
  productOwner?: User;
}

// API Response types
export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

// Filter types
export interface InitiativeFilters {
  page?: number;
  limit?: number;
  status?: InitiativeStatus | InitiativeStatus[];
  search?: string;
  targetQuarter?: string;
  businessOwnerId?: string;
  productOwnerId?: string;
}

// Bulk operation types
export interface BulkUpdateResult {
  updated: number;
  failed: number;
  errors: Array<{
    id: string;
    message: string;
  }>;
}

// Quarter helpers
export function getCurrentQuarter(): string {
  const now = new Date();
  const quarter = Math.floor(now.getMonth() / 3) + 1;
  return `${now.getFullYear()}-Q${quarter}`;
}

export function getQuarterOptions(yearsBack = 1, yearsForward = 2): { value: string; label: string }[] {
  const options: { value: string; label: string }[] = [];
  const now = new Date();
  const currentYear = now.getFullYear();

  for (let year = currentYear - yearsBack; year <= currentYear + yearsForward; year++) {
    for (let q = 1; q <= 4; q++) {
      const value = `${year}-Q${q}`;
      options.push({ value, label: value });
    }
  }

  return options;
}
