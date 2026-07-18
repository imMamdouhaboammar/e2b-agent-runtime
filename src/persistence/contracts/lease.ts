export interface LeaseManager {
  acquireLease(leaseName: string, ttlMs: number): Promise<boolean>;
  releaseLease(leaseName: string): Promise<void>;
  isLeaseActive(leaseName: string): Promise<boolean>;
}
