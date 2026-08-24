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

const BASE = "https://pokeapi.co/api/v2";

const cache = new Map<string, Promise<unknown>>();

async function fetchJSON<T>(path: string): Promise<T> {
  const cached = cache.get(path);
  if (cached) return cached as Promise<T>;
  const promise = (async () => {
    const res = await fetch(`${BASE}/${path}`);
    if (!res.ok) {
      cache.delete(path);
      throw new Error(`PokeAPI error ${res.status} for /${path}`);
    }
    return (await res.json()) as T;
  })();
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
