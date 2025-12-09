import { QueryInfo, SQLColumn, generateUpsertQuery } from '../db';
import { TopicFeature } from '../models/tables/topic_features';

export function getTopicFeatureUpsertQuery(feature: TopicFeature): QueryInfo {
  const columns: SQLColumn[] = [
    { name: 'group_id', value: feature.groupId },
    { name: 'topic_id', value: feature.topicId },
    { name: 'feature_polls', value: feature.featurePolls },
    { name: 'feature_top', value: feature.featureTop },
    { name: 'feature_group_collection', value: feature.featureGroupCollection },
  ];

  // Only include id if it's not 0 (auto-increment)
  if (feature.id && feature.id !== 0) {
    columns.unshift({ name: 'id', value: feature.id });
  }

  const tableName = 'topic_features';
  const query = generateUpsertQuery(tableName, columns, feature);
  return { tableName, query };
}

