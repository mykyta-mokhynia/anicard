import { QueryInfo, SQLColumn, generateUpsertQuery } from '../db';
import { GroupSettings } from '../models/tables/group_settings';

export function getGroupSettingsUpsertQuery(settings: GroupSettings): QueryInfo {
  const columns: SQLColumn[] = [
    { name: 'group_id', value: settings.groupId },
    { name: 'collection_interval_hours', value: settings.collectionIntervalHours },
    { name: 'collection_interval_minutes', value: settings.collectionIntervalMinutes },
    { name: 'topics_mode_enabled', value: settings.topicsModeEnabled },
  ];

  // Only include id if it's not 0 (auto-increment)
  if (settings.id && settings.id !== 0) {
    columns.unshift({ name: 'id', value: settings.id });
  }

  const tableName = 'group_settings';
  const query = generateUpsertQuery(tableName, columns, settings);
  return { tableName, query };
}

