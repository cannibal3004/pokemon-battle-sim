import type {
  EvolutionChainAPI,
  ListResponse,
  MoveAPI,
  NamedRef,
  NatureAPI,
  PokemonAPI,
  PokemonSpeciesAPI,
  TypeAPI,
} from "./types";
import { getCached, setCached } from "../data/persistentCache";

const BASE = "https://pokeapi.co/api/v2";

const cache = new Map<string, Promise<unknown>>();

async function fetchJSON<T>(path: string): Promise<T> {
  const cached = cache.get(path);
  if (cached) return cached as Promise<T>;

  // Second-level cache: raw JSON survives reloads, so revisiting a generation
  // costs nothing. Pokemon/move payloads are immutable by id.
  const persisted = getCached<T>(path);
  if (persisted !== null) {
    const done = Promise.resolve(persisted);
    cache.set(path, done);
    return done;
  }

  const promise = (async () => {
    let lastStatus = 0;
    // Team battles burst ~70 requests on load; retry politely on 429/5xx.
    for (let attempt = 0; attempt < 5; attempt++) {
      const res = await fetch(`${BASE}/${path}`);
      if (res.ok) {
        const data = (await res.json()) as T;
        setCached(path, data);
        return data;
      }
      lastStatus = res.status;
      if ((res.status === 429 || res.status >= 500) && attempt < 4) {
        await new Promise((r) => setTimeout(r, 1200 * (attempt + 1)));
        continue;
      }
      throw new Error(`PokeAPI error ${res.status} for /${path}`);
    }
    throw new Error(`PokeAPI error ${lastStatus} for /${path} (gave up retrying)`);
  })().catch((e) => {
    cache.delete(path);
    throw e;
  });
  cache.set(path, promise);
  return promise;
}

export const getPokemon = (idOrName: string | number) =>
  fetchJSON<PokemonAPI>(`pokemon/${idOrName}`);

export const getMove = (idOrName: string | number) =>
  fetchJSON<MoveAPI>(`move/${idOrName}`);

export const getType = (name: string) => fetchJSON<TypeAPI>(`type/${name}`);

export const getNatures = () =>
  fetchJSON<ListResponse<NatureAPI>>("nature?limit=25");

export const getEvolutionChain = (id: number) =>
  fetchJSON<EvolutionChainAPI>(`evolution-chain/${id}`);

export const getPokemonSpecies = (name: string) =>
  fetchJSON<PokemonSpeciesAPI>(`pokemon-species/${name}`);

export const chainIdFromUrl = (url: string): number => {
  const last = url.split("/").filter(Boolean).pop() ?? "";
  const n = Number(last);
  return Number.isFinite(n) ? n : 0;
};

export const getPokemonList = (limit: number, offset: number) =>
  fetchJSON<ListResponse<NamedRef>>(`pokemon?limit=${limit}&offset=${offset}`);
