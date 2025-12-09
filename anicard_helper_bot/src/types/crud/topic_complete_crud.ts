import { OrderedQuery, createOrderedQuery, executeQuery, selectQuery } from '../../db';
import { TopicComplete } from '../topic/topic_complete';
import { getGroupTopicUpsertQuery } from '../../crud/group_topics_crud';
import { getTopicFeatureUpsertQuery } from '../../crud/topic_features_crud';

/**
 * Создает упорядоченный запрос для сохранения TopicComplete
 */
export function getTopicCompleteUpsertQuery(complete: TopicComplete): OrderedQuery {
  const orderedQuery = createOrderedQuery();

  // 1. Сохраняем тему
  const topicQuery = getGroupTopicUpsertQuery(complete.groupTopic);
  orderedQuery.priorityUpsert.push(topicQuery);

  // 2. Сохраняем функционал темы (если есть)
  if (complete.topicFeature) {
    const featureQuery = getTopicFeatureUpsertQuery(complete.topicFeature);
    orderedQuery.upsertQueries.push(featureQuery);
  }

  return orderedQuery;
}

/**
 * Выполняет сохранение TopicComplete
 */
export async function saveTopicComplete(complete: TopicComplete): Promise<void> {
  const orderedQuery = getTopicCompleteUpsertQuery(complete);

  let fullQuery = '';

  // Выполняем приоритетные upsert
  for (const queryInfo of orderedQuery.priorityUpsert) {
    fullQuery += queryInfo.query + '\n';
  }

  // Выполняем обычные upsert
  for (const queryInfo of orderedQuery.upsertQueries) {
    fullQuery += queryInfo.query + '\n';
  }

  if (fullQuery.trim()) {
    await executeQuery(fullQuery);
  }
}

/**
 * Загружает TopicComplete по groupId и topicId
 */
export async function getTopicComplete(
  groupId: number,
  topicId: number
): Promise<TopicComplete | null> {
  const query = `
    SELECT 
      gt.id AS topic_id,
      gt.group_id AS topic_group_id,
      gt.topic_id AS topic_topic_id,
      gt.topic_name AS topic_topic_name,
      gt.created_at AS topic_created_at,
      gt.updated_at AS topic_updated_at,
      
      tf.id AS feature_id,
      tf.group_id AS feature_group_id,
      tf.topic_id AS feature_topic_id,
      tf.feature_polls AS feature_polls,
      tf.feature_top AS feature_top,
      tf.feature_group_collection AS feature_group_collection,
      tf.created_at AS feature_created_at,
      tf.updated_at AS feature_updated_at
      
    FROM group_topics gt
    LEFT JOIN topic_features tf 
      ON tf.group_id = gt.group_id 
      AND tf.topic_id = gt.topic_id
    WHERE gt.group_id = ? AND gt.topic_id = ?
    LIMIT 1
  `;

  const row = await selectQuery(query, [groupId, topicId], false);

  if (!row) {
    return null;
  }

  return {
    groupTopic: {
      id: row.topicId,
      groupId: row.topicGroupId,
      topicId: row.topicTopicId,
      topicName: row.topicTopicName,
      createdAt: row.topicCreatedAt,
      updatedAt: row.topicUpdatedAt,
    },
    topicFeature: row.featureId
      ? {
          id: row.featureId,
          groupId: row.featureGroupId,
          topicId: row.featureTopicId,
          featurePolls: row.featurePolls === 1 || row.featurePolls === true,
          featureTop: row.featureTop === 1 || row.featureTop === true,
          featureGroupCollection: row.featureGroupCollection === 1 || row.featureGroupCollection === true,
          createdAt: row.featureCreatedAt,
          updatedAt: row.featureUpdatedAt,
        }
      : null,
  };
}

