export interface TransactionContext {
  query(text: string, params?: any[]): Promise<any>;
}

export interface TransactionRunner {
  withTransaction<T>(callback: (ctx: TransactionContext) => Promise<T>): Promise<T>;
}
