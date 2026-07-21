// The soldiers — the heart of the game. Each is a person with a story, not just
// a stat block. This file defines the soldier data model and the starting pool
// of recruits available to hire.
//
// SOLDIER SCHEMA
// {
//   id:       unique string
//   name:     full name (may be just a callsign for the mysterious ones)
//   callsign: nickname shown in quotes, or "" if none
//   age:      number, or null if unknown
//   origin:   where they're from
//   bio:      a few sentences of dramatic backstory — this is what makes you
//             care when they die
//   stats: {
//     aim:    accuracy / hit chance           (1-10)
//     health: how much punishment they take   (1-10)
//     speed:  movement + reaction speed        (1-10)
//     nerve:  composure under fire; low nerve = panics, freezes, breaks (1-10)
//   }
//   traits:   short tags that flavor behavior and story (e.g. "Reckless")
//   cost:     credits to hire
//   status:   "recruit" | "roster" | "deployed" | "dead"
//   record:   { missions, kills } — filled in over a career
// }
//
// Stats are placeholder-tuned; they'll get wired to run-and-gun combat later.

export const RECRUIT_POOL = [
  {
    id: "vance",
    name: "Mara Vance",
    callsign: "Deadbolt",
    age: 34,
    origin: "Detroit, USA",
    bio: "Ex-SWAT breacher, discharged for putting a captain through a third-floor window. Nobody on Earth is better at a doorway. Nobody is worse at taking an order she disagrees with.",
    stats: { aim: 8, health: 6, speed: 5, nerve: 6 },
    traits: ["Steady Hands", "Insubordinate"],
    cost: 320,
    status: "recruit",
    record: { missions: 0, kills: 0 },
  },
  {
    id: "osei",
    name: "Kwame Osei",
    callsign: "Preacher",
    age: 41,
    origin: "Accra, Ghana",
    bio: "A UN field medic who watched a hospital vanish under alien fire and decided the species was being tested. He walks into the open like the bullets are someone else's business. He does not flinch. Ever.",
    stats: { aim: 5, health: 7, speed: 4, nerve: 10 },
    traits: ["Fearless", "Zealot"],
    cost: 300,
    status: "recruit",
    record: { missions: 0, kills: 0 },
  },
  {
    id: "tanaka",
    name: "Yuki Tanaka",
    callsign: "",
    age: 22,
    origin: "Osaka, Japan",
    bio: "Drone-racing world champion who got bored winning. The fastest hands on the roster and the shortest attention span. Treats incoming fire as a suggestion.",
    stats: { aim: 7, health: 4, speed: 9, nerve: 4 },
    traits: ["Reckless", "Fast Hands"],
    cost: 260,
    status: "recruit",
    record: { missions: 0, kills: 0 },
  },
  {
    id: "tex",
    name: "Tex",
    callsign: "",
    age: null,
    origin: "Unknown",
    bio: "Twenty years a mercenary across four continents. Won't give you his real name, his real age, or a straight answer. Worth every credit — and he is the first to remind you of it.",
    stats: { aim: 9, health: 8, speed: 3, nerve: 8 },
    traits: ["Veteran", "Mercenary"],
    cost: 480,
    status: "recruit",
    record: { missions: 0, kills: 0 },
  },
  {
    id: "reyes",
    name: "Ana Reyes",
    callsign: "",
    age: 27,
    origin: "Manila, Philippines",
    bio: "Lost her whole family in the first raid on the harbor district. Signed the enlistment papers the next morning, still in yesterday's clothes. She is not here for the money.",
    stats: { aim: 7, health: 6, speed: 6, nerve: 7 },
    traits: ["Vengeful", "Loyal"],
    cost: 240,
    status: "recruit",
    record: { missions: 0, kills: 0 },
  },
  {
    id: "ghost",
    name: "Ghost",
    callsign: "",
    age: 19,
    origin: "Unknown",
    bio: "A cyber-orphan who grew up in the city's dead networks. Can talk any machine into opening, but can barely hold a rifle steady. Cheap, green, and quietly terrified.",
    stats: { aim: 3, health: 4, speed: 7, nerve: 3 },
    traits: ["Green", "Tech-Savvy"],
    cost: 120,
    status: "recruit",
    record: { missions: 0, kills: 0 },
  },
];
