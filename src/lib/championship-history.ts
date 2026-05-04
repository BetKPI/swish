/**
 * Historical championship wins for major US sports teams.
 * Static data - updated once per year after each sport's championship.
 * Used by futures charts to show "last time they won" context.
 */

export interface ChampionshipRecord {
  title: number[]; // World Series / Finals / Stanley Cup years
  league: number[]; // AL/NL pennant, Conference championship years
  division: number[]; // Division title years
}

// ── MLB ──────────────────────────────────────────────────────────

const MLB_CHAMPIONSHIPS: Record<string, ChampionshipRecord> = {
  // AL East
  "New York Yankees": { title: [2009], league: [2009, 2003, 2001, 2000, 1999], division: [2024, 2022, 2019, 2012, 2011, 2009] },
  "Boston Red Sox": { title: [2018, 2013, 2007, 2004], league: [2018, 2013, 2007, 2004], division: [2018, 2017, 2016, 2013, 2007] },
  "Baltimore Orioles": { title: [1983, 1970], league: [2024, 2014, 1983, 1979, 1971, 1970, 1969], division: [2023, 2014, 1997, 1983] },
  "Toronto Blue Jays": { title: [1993, 1992], league: [1993, 1992], division: [2015, 1993, 1992, 1991, 1989, 1985] },
  "Tampa Bay Rays": { title: [], league: [2020, 2008], division: [2021, 2020, 2010, 2008] },
  // AL Central
  "Cleveland Guardians": { title: [1948], league: [2024, 2016, 1997, 1995], division: [2024, 2022, 2018, 2017, 2016, 2007, 2001] },
  "Minnesota Twins": { title: [1991, 1987], league: [1991, 1987, 1965], division: [2020, 2019, 2010, 2009, 2006, 2004, 2003, 2002] },
  "Detroit Tigers": { title: [1984, 1968], league: [2012, 2006, 1984, 1968], division: [2014, 2013, 2012, 2011] },
  "Kansas City Royals": { title: [2015, 1985], league: [2015, 2014, 1985, 1980], division: [2015, 2014] },
  "Chicago White Sox": { title: [2005], league: [2005], division: [2008, 2005, 2000] },
  // AL West
  "Houston Astros": { title: [2022, 2017], league: [2022, 2021, 2019, 2017, 2005], division: [2023, 2022, 2021, 2019, 2018, 2017] },
  "Texas Rangers": { title: [2023], league: [2023, 2011, 2010], division: [2016, 2015, 2011, 2010] },
  "Seattle Mariners": { title: [], league: [], division: [2001] },
  "Los Angeles Angels": { title: [2002], league: [2002], division: [2014, 2009, 2008, 2007, 2005, 2004] },
  "Oakland Athletics": { title: [1989, 1974, 1973, 1972], league: [1990, 1989, 1988], division: [2020, 2013, 2012, 2006, 2003, 2002, 2000] },
  // NL East
  "Los Angeles Dodgers": { title: [2024, 2020, 1988, 1981], league: [2024, 2020, 2018, 2017], division: [2024, 2023, 2022, 2021, 2020, 2019, 2018, 2017, 2016, 2015, 2014, 2013] },
  "Atlanta Braves": { title: [2021, 1995], league: [2021, 1999, 1996, 1995, 1992, 1991], division: [2023, 2022, 2021, 2019, 2018, 2013, 2005] },
  "New York Mets": { title: [1986, 1969], league: [2024, 2015, 2000, 1986], division: [2015, 2006] },
  "Philadelphia Phillies": { title: [2008], league: [2022, 2009, 2008], division: [2011, 2010, 2009, 2008, 2007] },
  "Washington Nationals": { title: [2019], league: [2019], division: [2019, 2017, 2016, 2014, 2012] },
  "Miami Marlins": { title: [2003, 1997], league: [2003, 1997], division: [] },
  // NL Central
  "Milwaukee Brewers": { title: [], league: [2024], division: [2024, 2023, 2021, 2018, 2011] },
  "St. Louis Cardinals": { title: [2011, 2006], league: [2013, 2011, 2006, 2004], division: [2022, 2019, 2015, 2014, 2013, 2009, 2006, 2005, 2004, 2002, 2000] },
  "Chicago Cubs": { title: [2016], league: [2016], division: [2020, 2017, 2016, 2008, 2007, 2003] },
  "Pittsburgh Pirates": { title: [1979, 1971], league: [1979, 1971], division: [2015, 2014, 2013] },
  "Cincinnati Reds": { title: [1990, 1976, 1975], league: [1990, 1976, 1975, 1972, 1970], division: [2012, 2010] },
  // NL West
  "San Diego Padres": { title: [], league: [2022, 1998, 1984], division: [2024, 2006, 1998] },
  "Arizona Diamondbacks": { title: [2001], league: [2023, 2001], division: [2023, 2011, 2007, 2002, 2001, 1999] },
  "San Francisco Giants": { title: [2014, 2012, 2010], league: [2014, 2012, 2010, 2002], division: [2021, 2012, 2010, 2003, 2000] },
  "Colorado Rockies": { title: [], league: [2007], division: [] },
};

// ── NBA ──────────────────────────────────────────────────────────

const NBA_CHAMPIONSHIPS: Record<string, ChampionshipRecord> = {
  "Boston Celtics": { title: [2024, 2008], league: [2024, 2022, 2010, 2008], division: [2025, 2024, 2023, 2022, 2021, 2017] },
  "Los Angeles Lakers": { title: [2020, 2010, 2009, 2002, 2001, 2000], league: [2020, 2010, 2009, 2008, 2004], division: [2020, 2012, 2011, 2010, 2009, 2008, 2004] },
  "Golden State Warriors": { title: [2022, 2018, 2017, 2015], league: [2022, 2019, 2018, 2017, 2016, 2015], division: [2019, 2018, 2017, 2016, 2015, 2014] },
  "Milwaukee Bucks": { title: [2021, 1971], league: [2021], division: [2024, 2023, 2022, 2021, 2020, 2019, 2014] },
  "Denver Nuggets": { title: [2023], league: [2023], division: [2025, 2024, 2023, 2020, 2019, 2009] },
  "Miami Heat": { title: [2013, 2012, 2006], league: [2023, 2020, 2014, 2013, 2012, 2011, 2006], division: [2014, 2013, 2012, 2011, 2007, 2006, 2005] },
  "Cleveland Cavaliers": { title: [2016], league: [2018, 2017, 2016, 2015], division: [2025, 2018, 2017, 2016, 2015] },
  "Dallas Mavericks": { title: [2011], league: [2024, 2011, 2006], division: [2024, 2022, 2010, 2007] },
  "Philadelphia 76ers": { title: [1983], league: [2001, 1983, 1982, 1980], division: [2001] },
  "Phoenix Suns": { title: [], league: [2021, 1993], division: [2023, 2021, 2007, 2005] },
  "New York Knicks": { title: [1973, 1970], league: [1999, 1994], division: [2024, 2013, 1994] },
  "Oklahoma City Thunder": { title: [], league: [2024, 2012], division: [2025, 2024, 2020, 2016, 2014, 2013, 2012] },
  "Minnesota Timberwolves": { title: [], league: [2024], division: [2024, 2004] },
  "Houston Rockets": { title: [1995, 1994], league: [1995, 1994, 1986, 1981], division: [2018, 2015] },
  "San Antonio Spurs": { title: [2014, 2007, 2005, 2003, 1999], league: [2014, 2013, 2007, 2005, 2003, 1999], division: [2017, 2016, 2015, 2014, 2013, 2012, 2011, 2006, 2005, 2003] },
  "Toronto Raptors": { title: [2019], league: [2019], division: [2020, 2019, 2018, 2015, 2014, 2007] },
  "Indiana Pacers": { title: [], league: [2024, 2000], division: [2014, 2013, 2004] },
  "Sacramento Kings": { title: [], league: [], division: [2023, 2003, 2002] },
  "Memphis Grizzlies": { title: [], league: [], division: [2023, 2022] },
  "New Orleans Pelicans": { title: [], league: [], division: [2008] },
  "Chicago Bulls": { title: [1998, 1997, 1996, 1993, 1992, 1991], league: [1998, 1997, 1996, 1993, 1992, 1991], division: [2012, 2011, 1998, 1997, 1996, 1993] },
  "Brooklyn Nets": { title: [], league: [2003, 2002], division: [2006, 2004] },
  "Los Angeles Clippers": { title: [], league: [], division: [2025] },
  "Atlanta Hawks": { title: [1958], league: [], division: [2015] },
  "Detroit Pistons": { title: [2004, 1990, 1989], league: [2004, 2005, 1990, 1989, 1988], division: [2008, 2007, 2006, 2005, 2003] },
  "Portland Trail Blazers": { title: [1977], league: [1992, 1990, 1977], division: [2019, 2018, 2015] },
  "Charlotte Hornets": { title: [], league: [], division: [] },
  "Orlando Magic": { title: [], league: [2009, 1995], division: [2010, 2009, 2008, 1996, 1995] },
  "Washington Wizards": { title: [1978], league: [1979, 1978, 1975], division: [] },
  "Utah Jazz": { title: [], league: [1998, 1997], division: [2021] },
};

// ── NHL ──────────────────────────────────────────────────────────

const NHL_CHAMPIONSHIPS: Record<string, ChampionshipRecord> = {
  "Florida Panthers": { title: [2024], league: [2024, 2023], division: [2024, 2023, 2022] },
  "Edmonton Oilers": { title: [1990, 1988, 1987, 1985, 1984], league: [2024, 2006], division: [2024, 2023, 2020, 2017] },
  "Vegas Golden Knights": { title: [2023], league: [2023], division: [2023, 2022, 2020, 2018] },
  "Colorado Avalanche": { title: [2022, 2001, 1996], league: [2022, 2001, 1996], division: [2025, 2024, 2022, 2021, 2014] },
  "Tampa Bay Lightning": { title: [2021, 2020, 2004], league: [2022, 2021, 2020, 2015, 2004], division: [2019, 2018, 2004, 2003] },
  "St. Louis Blues": { title: [2019], league: [2019], division: [2019, 2015, 2012, 2001, 2000, 1999] },
  "Washington Capitals": { title: [2018], league: [2018], division: [2020, 2019, 2018, 2017, 2016, 2010, 2009, 2008, 2001] },
  "Pittsburgh Penguins": { title: [2017, 2016, 2009], league: [2017, 2016, 2009, 2008], division: [2018, 2017, 2016, 2014, 2008] },
  "Chicago Blackhawks": { title: [2015, 2013, 2010], league: [2015, 2013, 2010], division: [2016, 2013, 2010] },
  "Los Angeles Kings": { title: [2014, 2012], league: [2014, 2012], division: [2012] },
  "Boston Bruins": { title: [2011], league: [2019, 2013, 2011], division: [2025, 2024, 2023, 2020, 2014, 2012, 2009, 2004, 2002] },
  "Carolina Hurricanes": { title: [2006], league: [2024, 2006, 2002], division: [2025, 2024, 2023, 2022, 2021, 2006] },
  "New York Rangers": { title: [1994], league: [2024, 2014, 1994], division: [2024, 2022, 2015, 2014, 2012] },
  "Dallas Stars": { title: [1999], league: [2024, 2020, 2000, 1999], division: [2024, 2023, 2020, 2016, 2006, 2003] },
  "Toronto Maple Leafs": { title: [1967, 1964, 1963, 1962, 1951], league: [], division: [2025, 2024, 2023, 2022, 2021, 2018] },
  "Detroit Red Wings": { title: [2008, 2002, 1998, 1997], league: [2009, 2008, 2002, 1998, 1997, 1995], division: [2008, 2007, 2006, 2005, 2004, 2003, 2002, 2001] },
  "Winnipeg Jets": { title: [], league: [], division: [2025, 2024, 2023, 2020, 2018] },
  "Minnesota Wild": { title: [], league: [], division: [2016, 2008] },
  "New Jersey Devils": { title: [2003, 2000, 1995], league: [2012, 2003, 2001, 2000, 1995], division: [2010, 2003, 2001, 1998, 1997] },
  "Montreal Canadiens": { title: [1993, 1986, 1979, 1978, 1977, 1976, 1973, 1971, 1969, 1968, 1966, 1965, 1960, 1959, 1958, 1957, 1956, 1953], league: [2021, 2014, 1993], division: [2015, 2013, 2008] },
  "Philadelphia Flyers": { title: [1975, 1974], league: [2010, 1997, 1987, 1985, 1980, 1976, 1975, 1974], division: [2020, 2017, 2012, 2011, 2008, 2004, 2002, 2000] },
  "Nashville Predators": { title: [], league: [2017], division: [2019, 2018] },
  "Columbus Blue Jackets": { title: [], league: [], division: [] },
  "Calgary Flames": { title: [1989], league: [2004, 1989, 1986], division: [2022, 2019, 2006] },
  "Ottawa Senators": { title: [], league: [2007], division: [2006, 2003] },
  "New York Islanders": { title: [1983, 1982, 1981, 1980], league: [], division: [2024, 2020, 2019] },
  "Vancouver Canucks": { title: [], league: [2011], division: [2025, 2024, 2013, 2012, 2011, 2010, 2007, 2004] },
  "Anaheim Ducks": { title: [2007], league: [2007, 2003], division: [2025, 2016, 2015, 2014, 2013, 2007] },
  "San Jose Sharks": { title: [], league: [2016], division: [2011, 2010, 2008, 2005, 2004, 2002] },
  "Arizona Coyotes": { title: [], league: [], division: [2012] },
  "Buffalo Sabres": { title: [], league: [1999, 1975], division: [2007, 2006] },
  "Seattle Kraken": { title: [], league: [], division: [] },
  "Utah Hockey Club": { title: [], league: [], division: [] },
};

/**
 * Look up championship history for a team across any sport.
 * Tries exact match first, then partial match on last word.
 */
export function getChampionshipHistory(teamName: string, sport: string): ChampionshipRecord | null {
  const s = sport.toUpperCase();
  const db = s === "MLB" || s === "BASEBALL" ? MLB_CHAMPIONSHIPS
    : s === "NBA" || s === "BASKETBALL" ? NBA_CHAMPIONSHIPS
    : s === "NHL" || s === "HOCKEY" ? NHL_CHAMPIONSHIPS
    : null;
  if (!db) return null;

  // Exact match
  if (db[teamName]) return db[teamName];

  // Partial match on last word (e.g. "Yankees" matches "New York Yankees")
  const lower = teamName.toLowerCase();
  for (const [key, val] of Object.entries(db)) {
    const keyLower = key.toLowerCase();
    if (keyLower.includes(lower) || lower.includes(keyLower.split(/\s+/).pop() || "")) {
      return val;
    }
  }
  return null;
}

/**
 * Build a championship history summary string for chart relevance text.
 */
export function formatChampionshipSummary(
  teamName: string,
  record: ChampionshipRecord,
  futuresType: "title" | "league" | "division"
): string {
  const years = record[futuresType];
  if (years.length === 0) return `${teamName} has never won this`;
  const recent = years.slice(0, 5).join(", ");
  const count = years.length;
  return `${teamName} last won: ${years[0]}. Won ${count}x total (${recent}${count > 5 ? "..." : ""})`;
}
