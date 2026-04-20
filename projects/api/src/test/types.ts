export interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
  comparisons?: ComparisonResult[];
}

export interface ComparisonResult {
  field: string;
  apiValue: unknown;
  webValue: unknown;
  match: boolean;
  note?: string;
}

export interface FetchJsonResult {
  status: number;
  data: unknown;
  isHtml: boolean;
  error?: string;
}

export interface FetchSvelteKitDataResult {
  success: boolean;
  data: unknown | null;
}
