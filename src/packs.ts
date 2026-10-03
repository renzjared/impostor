import type { Pack } from "./types";

export const CORE_PACKS: Pack[] = [
  {
    id: "everyday", title: "Everyday life", description: "The little things we all know", emoji: "☕", color: "peach",
    words: [
      { word: "Toothbrush", hints: ["Bathroom", "Morning", "Bristles"] }, { word: "Umbrella", hints: ["Rain", "Portable", "Weather"] },
      { word: "Microwave", hints: ["Kitchen", "Beep", "Leftovers"] }, { word: "Elevator", hints: ["Building", "Up", "Doors"] },
      { word: "Backpack", hints: ["School", "Travel", "Shoulders"] }, { word: "Alarm clock", hints: ["Morning", "Snooze", "Loud"] },
      { word: "Sunglasses", hints: ["Summer", "Eyes", "Style"] }, { word: "Fridge", hints: ["Kitchen", "Cold", "Snacks"] },
      { word: "Wallet", hints: ["Pocket", "Cards", "Money"] }, { word: "Headphones", hints: ["Music", "Travel", "Volume"] },
    ],
  },
  {
    id: "food", title: "On the menu", description: "You'll get hungry playing this", emoji: "🍜", color: "lime",
    words: [
      { word: "Sushi", hints: ["Japan", "Rice", "Raw"] }, { word: "Pancakes", hints: ["Breakfast", "Syrup", "Stack"] },
      { word: "Popcorn", hints: ["Movie", "Butter", "Snack"] }, { word: "Avocado", hints: ["Toast", "Green", "Brunch"] },
      { word: "Dumplings", hints: ["Steamed", "Filling", "Bite-sized"] }, { word: "Watermelon", hints: ["Summer", "Seeds", "Picnic"] },
      { word: "Pizza", hints: ["Slice", "Oven", "Delivery"] }, { word: "Ice cream", hints: ["Dessert", "Cold", "Cone"] },
      { word: "Bubble tea", hints: ["Straw", "Chewy", "Drink"] }, { word: "French fries", hints: ["Crispy", "Salt", "Side"] },
    ],
  },
  {
    id: "places", title: "Places & spaces", description: "Somewhere in the world", emoji: "🌍", color: "blue",
    words: [
      { word: "Airport", hints: ["Travel", "Security", "Departure"] }, { word: "Library", hints: ["Quiet", "Books", "Study"] },
      { word: "Aquarium", hints: ["Fish", "Glass", "Blue"] }, { word: "Beach", hints: ["Sand", "Waves", "Vacation"] },
      { word: "Museum", hints: ["Culture", "Exhibits", "Quiet"] }, { word: "Amusement park", hints: ["Thrills", "Queue", "Weekend"] },
      { word: "Coffee shop", hints: ["Laptop", "Caffeine", "Catch-up"] }, { word: "Camping site", hints: ["Outdoors", "Tent", "Night"] },
      { word: "Rooftop", hints: ["Above", "View", "Evening"] }, { word: "Train station", hints: ["Commuter", "Platform", "Schedule"] },
    ],
  },
  {
    id: "nature", title: "Wild world", description: "A little closer to nature", emoji: "🌱", color: "green",
    words: [
      { word: "Volcano", hints: ["Heat", "Mountain", "Eruption"] }, { word: "Butterfly", hints: ["Garden", "Wings", "Transformation"] },
      { word: "Coral reef", hints: ["Ocean", "Colorful", "Fragile"] }, { word: "Pineapple", hints: ["Tropical", "Spiky", "Sweet"] },
      { word: "Lightning", hints: ["Storm", "Flash", "Electric"] }, { word: "Penguin", hints: ["Cold", "Waddling", "Bird"] },
      { word: "Waterfall", hints: ["River", "Height", "Mist"] }, { word: "Desert", hints: ["Dry", "Vast", "Sand"] },
      { word: "Aurora", hints: ["Night", "Sky", "Colorful"] }, { word: "Bamboo", hints: ["Fast", "Green", "Panda"] },
    ],
  },
  {
    id: "entertainment", title: "Pop culture", description: "The stuff we all watch & play", emoji: "🎬", color: "purple",
    words: [
      { word: "Superhero", hints: ["Cape", "Action", "Origin"] }, { word: "Karaoke", hints: ["Mic", "Friends", "Performance"] },
      { word: "Board game", hints: ["Strategy", "Table", "Competition"] }, { word: "Roller coaster", hints: ["Speed", "Scream", "Track"] },
      { word: "Magic trick", hints: ["Surprise", "Hands", "Impossible"] }, { word: "Video game", hints: ["Controller", "Quest", "Screen"] },
      { word: "Reality TV", hints: ["Drama", "Contestant", "Camera"] }, { word: "Escape room", hints: ["Puzzles", "Team", "Clock"] },
      { word: "Stand-up comedy", hints: ["Stage", "Mic", "Laughter"] }, { word: "Talent show", hints: ["Judges", "Spotlight", "Finale"] },
    ],
  },
];

export const AVATARS = ["🦊", "🐸", "🐼", "🐙", "🦋", "🐨", "🦄", "🐯", "🐻", "🐧", "🐰", "🦝"];

export function randomId() {
  return crypto.randomUUID();
}

export function makeCode(length = 6) {
  return Array.from({ length }, () => Math.floor(Math.random() * 10)).join("");
}
