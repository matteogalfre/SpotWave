const mockStore = new Map<string, string>();
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: async (k: string) => mockStore.get(k) ?? null,
    setItem: async (k: string, v: string) => { mockStore.set(k, v); },
  },
}));
jest.mock('expo-constants', () => ({ __esModule: true, default: { expoConfig: { version: 'test' } } }));
const mockPost = jest.fn();
jest.mock('../services/googleForm', () => ({
  postGoogleFormStatus: (...args: unknown[]) => mockPost(...args),
}));

import { submitRating, flushPendingRatings, hasRatedToday, RatingPayload } from '../services/ratings';

const KEY = '@sw_ratings';
const DAY = 24 * 3600 * 1000;
let n = 0;

function rating(over: Partial<RatingPayload> = {}): RatingPayload {
  n += 1;
  return {
    id: `r${n}`,
    spotId: 'spot',
    spotName: 'Spot',
    country: 'France',
    userScore: 5,
    appScore: 4,
    localTime: '2026-10-14T10:00',
    swellH: 1,
    swellT: 10,
    peakT: 12,
    waveH: 1.2,
    swellDir: 280,
    windSpeed: 5,
    windGust: 8,
    windDir: 90,
    seaTemp: 18,
    factors: null,
    ts: new Date().toISOString(),
    appVersion: 'test',
    locale: 'fr',
    day: '2026-10-14',
    level: 'intermediate',
    ...over,
  };
}

const stored = (): Array<Record<string, unknown>> => JSON.parse(mockStore.get(KEY) ?? '[]');
const seed = (list: object[]) => mockStore.set(KEY, JSON.stringify(list));
const postedBodies = (): Array<Record<string, unknown>> =>
  mockPost.mock.calls.map((c) => JSON.parse(Object.values(c[1] as Record<string, string>)[0]));
const tick = () => new Promise((r) => setImmediate(r));

beforeEach(() => {
  mockStore.clear();
  mockPost.mockReset();
});

describe('envoi des notes', () => {
  it('ne renvoie jamais une note que le formulaire a acceptée', async () => {
    mockPost.mockResolvedValue(200);
    expect(await submitRating(rating())).toBe(true);
    await flushPendingRatings();
    await flushPendingRatings();
    expect(mockPost).toHaveBeenCalledTimes(1);
  });

  it('compte une réponse 4xx comme reçue : réessayer ne servirait à rien', async () => {
    mockPost.mockResolvedValue(400);
    await submitRating(rating());
    await flushPendingRatings();
    expect(mockPost).toHaveBeenCalledTimes(1);
    expect(stored()[0].sent).toBe(true);
  });

  it('renvoie plus tard une note restée sans réponse, sans les champs internes', async () => {
    mockPost.mockResolvedValueOnce(null).mockResolvedValue(200);
    const r = rating();
    expect(await submitRating(r)).toBe(false);
    await flushPendingRatings();
    expect(mockPost).toHaveBeenCalledTimes(2);
    const [first, second] = postedBodies();
    expect(second.id).toBe(r.id);
    expect(second).toEqual(first);
    expect(second).not.toHaveProperty('sent');
    expect(second).not.toHaveProperty('attempts');
    expect(stored()[0].sent).toBe(true);
  });

  it('réessaie aussi sur une erreur 5xx', async () => {
    mockPost.mockResolvedValueOnce(503).mockResolvedValue(200);
    await submitRating(rating());
    await flushPendingRatings();
    expect(mockPost).toHaveBeenCalledTimes(2);
  });

  it('abandonne après 5 tentatives', async () => {
    mockPost.mockResolvedValue(null);
    await submitRating(rating());
    for (let i = 0; i < 8; i++) await flushPendingRatings();
    expect(mockPost).toHaveBeenCalledTimes(5);
  });

  it('ne réessaie plus une note donnée il y a plus de 30 jours', async () => {
    seed([{ ...rating({ ts: new Date(Date.now() - 40 * DAY).toISOString() }), sent: false }]);
    await flushPendingRatings();
    expect(mockPost).not.toHaveBeenCalled();
  });

  it('envoie une seule fois chaque note quand deux relances se croisent', async () => {
    seed([{ ...rating(), sent: false }, { ...rating(), sent: false }]);
    mockPost.mockImplementation(async () => { await tick(); return 200; });
    await Promise.all([flushPendingRatings(), flushPendingRatings()]);
    expect(mockPost).toHaveBeenCalledTimes(2);
  });

  it('ne perd pas une note donnée pendant une relance', async () => {
    const old = rating();
    seed([{ ...old, sent: false }]);
    let answerOld: (status: number) => void = () => {};
    mockPost
      .mockImplementationOnce(() => new Promise((resolve) => { answerOld = resolve; }))
      .mockResolvedValue(200);

    const flush = flushPendingRatings();
    await tick();
    expect(mockPost).toHaveBeenCalledTimes(1); // la relance attend Google

    const fresh = rating();
    await submitRating(fresh);
    answerOld(200);
    await flush;

    const list = stored();
    expect(list.map((r) => r.id)).toEqual([old.id, fresh.id]);
    expect(list.every((r) => r.sent === true)).toBe(true);
  });

  it('envoie une fois, avec un id stable, une note stockée par une ancienne version', async () => {
    const legacy: Record<string, unknown> = { ...rating(), sent: false };
    delete legacy.id;
    seed([legacy]);
    mockPost.mockResolvedValue(200);
    await flushPendingRatings();
    await flushPendingRatings();
    expect(mockPost).toHaveBeenCalledTimes(1);
    expect(postedBodies()[0].id).toBe(`spot|intermediate|${legacy.ts}`);
    expect(stored()[0].sent).toBe(true);
  });

  it('garde la note sur l\'appareil pour bloquer une deuxième note le même jour', async () => {
    mockPost.mockResolvedValue(null);
    await submitRating(rating());
    expect(await hasRatedToday('spot', '2026-10-14', 'intermediate')).toBe(true);
    expect(await hasRatedToday('spot', '2026-10-14', 'expert')).toBe(false);
  });
});
