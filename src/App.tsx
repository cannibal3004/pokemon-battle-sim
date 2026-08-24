import { useEffect, useState } from "react";
import { getTypeChart } from "./data/typeChart";
import { loadNatures } from "./data/pokemon";
import type { NatureDef } from "./battle/types";
import { Lobby } from "./components/Lobby";
import { BattleScreen, type MatchSetup } from "./components/Battle";

export default function App() {
  const [chart, setChart] = useState<number[][] | null>(null);
  const [natures, setNatures] = useState<NatureDef[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [setup, setSetup] = useState<MatchSetup | null>(null);

  useEffect(() => {
    Promise.all([getTypeChart(), loadNatures()])
      .then(([c, n]) => {
        setChart(c);
        setNatures(n);
      })
      .catch((e) => setError(String(e)));
  }, []);

  if (error) {
    return (
      <div className="loading-screen">
        <div className="fatal">
          Failed to load data from Pok&eacute;API.
          <pre>{error}</pre>
        </div>
      </div>
    );
  }

  if (!chart || !natures) {
    return (
      <div className="loading-screen">
        <div className="pokeball-spinner" />
        <p>Loading Pok&eacute;mon data from Pok&eacute;API...</p>
      </div>
    );
  }

  if (setup) {
    return (
      <BattleScreen setup={setup} chart={chart} natures={natures} onExit={() => setSetup(null)} />
    );
  }

  return <Lobby onStart={setSetup} />;
}
