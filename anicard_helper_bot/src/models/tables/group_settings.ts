export interface GroupSettings {
  id?: number;
  groupId: number;
  collectionIntervalHours: number;
  collectionIntervalMinutes: number;
  topicsModeEnabled: boolean;
  timezone?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

