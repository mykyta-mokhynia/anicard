export interface TopicFeature {
  id?: number;
  groupId: number;
  topicId: number;
  featurePolls: boolean;
  featureTop: boolean;
  featureGroupCollection: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

