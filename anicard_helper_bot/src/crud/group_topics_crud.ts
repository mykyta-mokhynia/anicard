import { QueryInfo, SQLColumn, generateUpsertQuery } from '../db';
import { GroupTopic } from '../models/tables/group_topics';

export function getGroupTopicUpsertQuery(topic: GroupTopic): QueryInfo {
  const columns: SQLColumn[] = [
    { name: 'group_id', value: topic.groupId },
    { name: 'topic_id', value: topic.topicId },
    { name: 'topic_name', value: topic.topicName },
  ];

  // Only include id if it's not 0 (auto-increment)
  if (topic.id && topic.id !== 0) {
    columns.unshift({ name: 'id', value: topic.id });
  }

  const tableName = 'group_topics';
  const query = generateUpsertQuery(tableName, columns, topic);
  return { tableName, query };
}

