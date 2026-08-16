import { locationInfo } from '../../data/collections';

// 从本地静态数据获取收藏品集合的API
export default function handler(req, res) {
  try {
    // 将locationInfo转换为admin页面使用的格式
    const collections = locationInfo.map((item, index) => ({
      id: item.id ?? (index + 1),
      ...item,
      description: item.description || '',
      date: item.date || '',
      scale: item.scale || 1,
      coordinates: item.coordinates || [35.6762, 139.6503],
      travelNote: item.travelNote || ''
    }));
    
    res.status(200).json({ collections });
  } catch (error) {
    console.error('Error fetching collections:', error);
    res.status(500).json({ error: 'Failed to fetch collections', details: error.message });
  }
} 