// Supabase 미설정 시 사용하는 서버 측 메모리 폴백.
// Vercel 서버리스에서는 인스턴스 간 공유가 안되지만 로컬 개발용으로 유용함.
const g = globalThis;
if (!g.__minesweeperStore) {
  g.__minesweeperStore = { scores: [], reviews: [], seq: 1 };
}
export const store = g.__minesweeperStore;
export function nextId() { return store.seq++; }
