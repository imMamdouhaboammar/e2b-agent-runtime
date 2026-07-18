export interface IdempotencyRecord {
  key: string;
  responseBody: any;
  createdAt: string;
}

export interface IdempotencyStore {
  getRecord(key: string): Promise<IdempotencyRecord | null>;
  saveRecord(key: string, responseBody: any): Promise<void>;
  deleteRecord(key: string): Promise<void>;
}
