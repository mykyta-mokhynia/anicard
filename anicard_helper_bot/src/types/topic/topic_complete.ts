import { GroupTopic } from '../../models/tables/group_topics';
import { TopicFeature } from '../../models/tables/topic_features';

/**
 * Полная информация о теме
 * Включает информацию о теме и её настройки функционала
 */
export interface TopicComplete {
  groupTopic: GroupTopic;
  topicFeature: TopicFeature | null;
}

