import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = '@spotwave_search_history';
const MAX_ITEMS = 8;

export async function getSearchHistory(): Promise<string[]> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export async function addSearchHistory(query: string): Promise<string[]> {
  const trimmed = query.trim();
  if (trimmed.length < 2) return getSearchHistory();
  const current = await getSearchHistory();
  const filtered = current.filter(q => q.toLowerCase() !== trimmed.toLowerCase());
  const next = [trimmed, ...filtered].slice(0, MAX_ITEMS);
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(next));
  } catch {}
  return next;
}

export async function clearSearchHistory(): Promise<void> {
  try {
    await AsyncStorage.removeItem(KEY);
  } catch {}
}
