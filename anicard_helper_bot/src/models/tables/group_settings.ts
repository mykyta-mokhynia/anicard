export interface GroupSettings {
  id?: number;
  groupId: number;
  collectionIntervalHours: number;
  collectionIntervalMinutes: number;
  topicsModeEnabled: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

