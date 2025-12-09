import { GroupSettings } from '../../models/tables/group_settings';
import { TopicComplete } from '../topic/topic_complete';

/**
 * Полная информация о настройках группы
 * Включает настройки группы и все темы с их функционалом
 */
export interface GroupSettingsComplete {
  groupSettings: GroupSettings;
  topics: TopicComplete[];
}

