import { OrderedQuery, createOrderedQuery, executeQuery, selectQuery } from '../../db';
import { GroupSettingsComplete } from '../group_settings/group_settings_complete';
import { getGroupSettingsUpsertQuery } from '../../crud/group_settings_crud';
import { getGroupTopicUpsertQuery } from '../../crud/group_topics_crud';
import { getTopicFeatureUpsertQuery } from '../../crud/topic_features_crud';

/**
 * Создает упорядоченный запрос для сохранения GroupSettingsComplete
 */
export function getGroupSettingsCompleteUpsertQuery(
  complete: GroupSettingsComplete
): OrderedQuery {
  const orderedQuery = createOrderedQuery();

  // 1. Сохраняем настройки группы (приоритетный upsert)
  const settingsQuery = getGroupSettingsUpsertQuery(complete.groupSettings);
  orderedQuery.priorityUpsert.push(settingsQuery);

  // 2. Сохраняем темы и их функционал
  for (const topicComplete of complete.topics) {
    // Сохраняем тему
    const topicQuery = getGroupTopicUpsertQuery(topicComplete.groupTopic);
    orderedQuery.upsertQueries.push(topicQuery);

    // Сохраняем функционал темы (если есть)
    if (topicComplete.topicFeature) {
      const featureQuery = getTopicFeatureUpsertQuery(topicComplete.topicFeature);
      orderedQuery.upsertQueries.push(featureQuery);
    }
  }

  return orderedQuery;
}

/**
 * Выполняет сохранение GroupSettingsComplete
 */
export async function saveGroupSettingsComplete(
  complete: GroupSettingsComplete
): Promise<void> {
  const orderedQuery = getGroupSettingsCompleteUpsertQuery(complete);

  let fullQuery = '';

  // Выполняем приоритетные upsert
  for (const queryInfo of orderedQuery.priorityUpsert) {
    fullQuery += queryInfo.query + '\n';
  }

  // Выполняем обычные upsert
  for (const queryInfo of orderedQuery.upsertQueries) {
    fullQuery += queryInfo.query + '\n';
  }

  // Выполняем удаления (если есть)
  for (const queryInfo of orderedQuery.deleteQueries) {
    fullQuery += queryInfo.query + '\n';
  }

  if (fullQuery.trim()) {
    await executeQuery(fullQuery);
  }
}

/**
 * Загружает GroupSettingsComplete по groupId
 */
export async function getGroupSettingsComplete(groupId: number): Promise<GroupSettingsComplete | null> {
  // Загружаем настройки группы
  const settingsQuery = `
    SELECT * FROM group_settings 
    WHERE group_id = ?
  `;
  const settings = await selectQuery(settingsQuery, [groupId], false);

  if (!settings) {
    return null;
  }

  // Загружаем темы с их функционалом
  const topicsQuery = `
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
    WHERE gt.group_id = ?
    ORDER BY gt.topic_id ASC
  `;

  const topicRows = await selectQuery(topicsQuery, [groupId]);

  const topics = topicRows.map((row: any) => ({
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
  }));

  return {
    groupSettings: settings,
    topics,
  };
}

