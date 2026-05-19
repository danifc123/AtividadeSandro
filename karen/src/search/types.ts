export interface WebSearchHit {
  title: string;
  snippet: string;
  url: string;
}

export interface WebSearchResult {
  query: string;
  provider: string;
  results: WebSearchHit[];
}
