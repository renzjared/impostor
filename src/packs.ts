import type { Pack } from "./types";

function makePack(
  id: string,
  title: string,
  description: string,
  emoji: string,
  color: string,
  entries: string,
): Pack {
  return {
    id, title, description, emoji, color,
    words: entries.trim().split("\n").map((entry) => {
      const [word, ...hints] = entry.split("|").map((part) => part.trim());
      return { word: word!, hints };
    }),
  };
}

export const CORE_PACKS: Pack[] = [
  makePack("everyday", "Everyday life", "The little things we all know", "☕", "peach", `
Toothbrush|Bathroom|Morning|Bristles
Umbrella|Rain|Portable|Weather
Microwave|Kitchen|Beep|Leftovers
Elevator|Building|Up|Doors
Backpack|School|Travel|Shoulders
Alarm clock|Morning|Snooze|Loud
Sunglasses|Summer|Eyes|Style
Fridge|Kitchen|Cold|Snacks
Wallet|Pocket|Cards|Money
Headphones|Music|Travel|Volume
Laundry basket|Clothes|Chores|Hamper
Keychain|Keys|Pocket|Souvenir
Vacuum cleaner|Carpet|Dust|Loud
Light switch|Wall|Room|Click
Water bottle|Hydration|Reusable|Thirst
Towel|Bath|Dry|Fold
Mirror|Reflection|Glass|Getting ready
Remote control|Buttons|Couch|Channel
Sofa|Living room|Cushions|Relax
Notebook|Pages|Writing|School
Tissue box|Sneeze|Paper|Dispenser
Doorbell|Visitor|Front door|Ding
Extension cord|Outlet|Cable|Power
Coffee mug|Handle|Hot drink|Desk
Trash bin|Waste|Liner|Kitchen
`),
  makePack("food", "On the menu", "You'll get hungry playing this", "🍜", "lime", `
Sushi|Japan|Rice|Raw
Pancakes|Breakfast|Syrup|Stack
Popcorn|Movie|Butter|Snack
Avocado|Toast|Green|Brunch
Dumplings|Steamed|Filling|Bite-sized
Watermelon|Summer|Seeds|Picnic
Pizza|Slice|Oven|Delivery
Ice cream|Dessert|Cold|Cone
Bubble tea|Straw|Chewy|Drink
French fries|Crispy|Salt|Side
Spaghetti|Pasta|Sauce|Twirl
Grilled cheese|Sandwich|Melted|Pan
Mango|Tropical|Sweet|Fruit
Taco|Shell|Filling|Tuesday
Donut|Glaze|Hole|Bakery
Ramen|Broth|Noodles|Slurp
Chocolate cake|Dessert|Layers|Frosting
Lemonade|Citrus|Summer|Pitcher
Pretzel|Twist|Salt|Snack
Omelet|Eggs|Breakfast|Folded
Corn on the cob|Butter|Summer|Kernels
Hot chocolate|Winter|Marshmallow|Warm
Caesar salad|Lettuce|Croutons|Dressing
Peanut butter|Spread|Sandwich|Jar
Milkshake|Blended|Straw|Creamy
`),
  makePack("places", "Places & spaces", "Somewhere in the world", "🌍", "blue", `
Airport|Travel|Security|Departure
Library|Quiet|Books|Study
Aquarium|Fish|Glass|Blue
Beach|Sand|Waves|Vacation
Museum|Culture|Exhibits|Quiet
Amusement park|Thrills|Queue|Weekend
Coffee shop|Laptop|Caffeine|Catch-up
Camping site|Outdoors|Tent|Night
Rooftop|Above|View|Evening
Train station|Commuter|Platform|Schedule
Bakery|Bread|Morning|Pastry
Gym|Weights|Workout|Membership
Pharmacy|Medicine|Counter|Prescription
Flower shop|Bouquet|Petals|Gift
Barbershop|Haircut|Chair|Clippers
Bus stop|Commute|Bench|Route
Grocery store|Cart|Aisles|Shopping
Movie theater|Screen|Tickets|Popcorn
Post office|Mail|Stamps|Parcel
Playground|Children|Swings|Park
Stadium|Crowd|Game|Seats
Hotel lobby|Travel|Reception|Check-in
Food court|Mall|Tables|Lunch
Laundromat|Washers|Coins|Spin
Bookstore|Shelves|Reading|Purchase
`),
  makePack("nature", "Wild world", "A little closer to nature", "🌱", "green", `
Volcano|Heat|Mountain|Eruption
Butterfly|Garden|Wings|Transformation
Coral reef|Ocean|Colorful|Fragile
Pineapple|Tropical|Spiky|Sweet
Lightning|Storm|Flash|Electric
Penguin|Cold|Waddling|Bird
Waterfall|River|Height|Mist
Desert|Dry|Vast|Sand
Aurora|Night|Sky|Colorful
Bamboo|Fast|Green|Panda
Owl|Night|Feathers|Hoot
Tide pool|Shore|Small creatures|Low tide
Mushroom|Forest|Cap|Fungi
Hummingbird|Tiny|Wings|Nectar
Glacier|Ice|Slow|Mountain
Mangrove|Coast|Roots|Wetland
Firefly|Summer|Glow|Evening
Oak tree|Acorn|Shade|Branches
Sea turtle|Ocean|Shell|Migration
Meadow|Wildflowers|Grass|Open field
Earthquake|Ground|Shaking|Fault
Rainbow|Rain|Colors|Sunshine
Cactus|Desert|Spines|Water
Dolphin|Ocean|Pod|Clicks
Pine forest|Cones|Evergreen|Mountain
`),
  makePack("entertainment", "Pop culture", "The stuff we all watch & play", "🎬", "purple", `
Superhero|Cape|Action|Origin
Karaoke|Mic|Friends|Performance
Board game|Strategy|Table|Competition
Roller coaster|Speed|Scream|Track
Magic trick|Surprise|Hands|Impossible
Video game|Controller|Quest|Screen
Reality TV|Drama|Contestant|Camera
Escape room|Puzzles|Team|Clock
Stand-up comedy|Stage|Mic|Laughter
Talent show|Judges|Spotlight|Finale
Podcast|Microphone|Episodes|Listening
Dance battle|Music|Moves|Challenge
Horror movie|Scary|Dark|Jump scare
Documentary|Real life|Narration|Facts
Variety show|Performance|Audience|Applause
Arcade|Tokens|Cabinet|High score
Photo booth|Props|Flash|Strip
Improv|Unscripted|Scene|Suggestion
Musical|Songs|Stage|Choreography
Card trick|Deck|Shuffle|Amazement
Puzzle hunt|Clues|Riddle|Teamwork
Streaming service|Episodes|Subscription|Binge
Conspiracy thriller|Mystery|Clues|Paranoia
Talent competition|Audition|Judges|Final
Silent film|Black and white|Gestures|Piano
`),
  makePack("everyday-things", "Everyday Things", "Objects hiding in plain sight", "🧺", "peach", `
Stapler|Desk|Paper|Click
Measuring tape|Length|Retractable|DIY
Clothespin|Laundry|Line|Clip
Flashlight|Dark|Batteries|Beam
Pillow|Bed|Soft|Sleep
Doormat|Entryway|Shoes|Welcome
Sewing needle|Thread|Fabric|Tiny
Shower curtain|Bathroom|Water|Rings
Ice tray|Freezer|Cubes|Plastic
Colander|Pasta|Drain|Holes
Frying pan|Stove|Handle|Sizzle
Oven mitt|Kitchen|Heat|Fabric
Dustpan|Broom|Sweep|Floor
Coat hanger|Closet|Hook|Shoulders
Hairbrush|Bristles|Getting ready|Tangles
Screwdriver|Toolbox|Twist|Repair
Power bank|Phone|Charging|Portable
Sticky note|Reminder|Desk|Adhesive
Sunscreen|Summer|Skin|SPF
Hand sanitizer|Clean|Bottle|Alcohol
Shoe rack|Entryway|Pairs|Storage
Ruler|Straight edge|Measurement|School
Thermos|Hot drink|Insulated|Travel
Coin purse|Change|Small|Zipper
Air freshener|Scent|Car|Spray
`),
  makePack("food-drinks", "Food and Drinks", "A little bit of everything edible", "🥤", "lime", `
Adobo|Soy sauce|Garlic|Slow-cooked
Bibingka|Rice cake|Banana leaf|Christmas
Halo-halo|Shaved ice|Colorful|Dessert
Kimchi|Fermented|Cabbage|Spicy
Croissant|Flaky|Butter|Bakery
Pho|Broth|Herbs|Noodles
Falafel|Chickpeas|Fried|Pita
Churros|Cinnamon|Fried|Dipping sauce
Matcha latte|Green|Tea|Foam
Espresso|Coffee|Small|Strong
Miso soup|Japanese|Broth|Tofu
Fried chicken|Crispy|Bucket|Picnic
Pesto|Basil|Pasta|Green sauce
Nachos|Chips|Cheese|Sharing
Sourdough|Bread|Starter|Tangy
Milk tea|Tea|Creamy|Iced
Sinigang|Sour|Tamarind|Soup
Tiramisu|Coffee|Layers|Mascarpone
Popsicle|Frozen|Stick|Summer
Kebab|Grilled|Skewer|Street food
Kimchi fried rice|Pan|Spicy|Leftovers
Apple pie|Cinnamon|Crust|Dessert
Iced coffee|Caffeine|Cold|Cup
Gyoza|Pan-fried|Filling|Japanese
Mochi|Chewy|Rice|Sweet
`),
  makePack("animanga", "Animanga", "Tropes, terms, and things from animated stories", "🌸", "pink", `
Mecha|Piloted|Machine|Sci-fi
Shonen|Action|Rivalry|Coming of age
Magical girl|Transformation|Sparkles|Team
Slice of life|Everyday|Relaxed|School
Manga panel|Ink|Page|Speech bubble
Anime opening|Theme song|Credits|Montage
Chibi|Tiny|Cute|Big head
Tsundere|Blunt|Soft side|Romance
Dojo|Training|Martial arts|Wooden floor
Spirit realm|Supernatural|Otherworld|Journey
Tournament arc|Bracket|Fighters|Final round
Ninja village|Shinobi|Hidden|Headband
Talking mascot|Sidekick|Cute|Companion
Transformation sequence|Outfit|Sparkles|Power-up
Training montage|Practice|Determination|Progress
Found family|Team|Loyalty|Chosen
Rival character|Competition|Respect|Challenge
Fantasy guild|Quests|Adventurers|Notice board
Super move|Attack|Shout|Finisher
School festival|Stalls|Stage|Classmates
Cat spirit|Whiskers|Magic|Mysterious
Parallel world|Portal|Alternate|Adventure
Volume release|Paperback|Collecting|Chapters
Voice actor|Performance|Character|Studio
Cosplay|Costume|Convention|Crafting
`),
  makePack("uy-pilipins", "Uy, Pilipins!", "Local places, traditions, and everyday culture", "🇵🇭", "blue", `
Jeepney|Commute|Colorful|Route
Tricycle|Sidecar|Neighborhood|Ride
Bahay kubo|Nipa|Bamboo|Traditional
Parol|Christmas|Star|Lantern
Sari-sari store|Neighborhood|Snacks|Small shop
Karaoke night|Microphone|Videoke|High notes
Fiesta|Town|Food|Celebration
Pandesal|Bakery|Morning|Bread
Lumpia|Fried|Wrapper|Party
Lechon|Roasted|Celebration|Crispy
Palengke|Market|Fresh produce|Vendor
Barong Tagalog|Formal|Embroidered|Clothing
Tinikling|Bamboo|Dance|Rhythm
Manila Bay|Sunset|Waterfront|City
Baguio|Pine trees|Cool weather|Strawberries
Chocolate Hills|Bohol|Landscape|Mounds
Banaue Rice Terraces|Mountain|Farms|Steps
Taal Volcano|Lake|Island|View
Balikbayan box|Overseas|Package|Family
Merienda|Afternoon|Snack|Break
Barkada|Friends|Group|Hangout
Brownout|Power|Outage|Flashlight
Pabitin|Party game|Hanging|Prizes
Taho|Silken tofu|Syrup|Morning vendor
Walis tingting|Broom|Leaves|Sweeping
`),
  makePack("school", "School", "Classroom memories and campus life", "🎒", "blue", `
Chalkboard|Classroom|Dust|Writing
Report card|Grades|Term|Envelope
School bus|Yellow|Route|Morning
Homeroom|Class|Teacher|Announcements
Science fair|Project|Display|Judges
Field trip|Permission slip|Bus|Excursion
Hall pass|Leaving class|Paper|Teacher
Locker|Combination|Books|Hallway
School bell|Period|Ring|Schedule
Group project|Team|Deadline|Presentation
Pop quiz|Surprise|Questions|Class
Graduation cap|Tassel|Ceremony|Throw
Yearbook|Photos|Signatures|Memories
Detention|After school|Rules|Quiet
School play|Rehearsal|Stage|Costume
Pencil case|Zipper|Supplies|Desk
Whiteboard marker|Ink|Cap|Classroom
Library card|Books|Borrowing|Barcode
Lab goggles|Safety|Science|Eyes
Lunch tray|Cafeteria|Compartments|Meal
Attendance sheet|Names|Present|Roll call
School uniform|Dress code|Clothing|Campus
Essay|Thesis|Paragraphs|Writing
Study group|Notes|Review|Friends
School assembly|Announcements|Gym|Gathering
`),
  makePack("mathematics", "Mathematics", "Numbers, shapes, and satisfying patterns", "📐", "purple", `
Fraction|Numerator|Denominator|Part
Prime number|Divisible|One|Factors
Equation|Equals|Unknown|Solve
Triangle|Three sides|Angles|Shape
Pi|Circle|Decimal|3.14
Variable|Letter|Unknown|Algebra
Coordinate plane|Axes|Graph|Ordered pair
Probability|Chance|Outcome|Likelihood
Percentage|Hundred|Discount|Rate
Square root|Radical|Number|Inverse
Parallel lines|Never meet|Geometry|Direction
Integer|Positive|Negative|Whole number
Fibonacci sequence|Pattern|Add|Spiral
Mean|Average|Sum|Divide
Perimeter|Boundary|Distance|Add sides
Volume|Space|Three dimensions|Capacity
Exponent|Power|Repeated|Base
Symmetry|Mirror|Balanced|Reflection
Pythagorean theorem|Right triangle|Squares|Hypotenuse
Prime factorization|Breakdown|Factors|Multiplication
Scientific notation|Powers of ten|Compact|Large numbers
Median|Middle|Sorted|Data
Vector|Direction|Magnitude|Arrow
Tessellation|Tiling|Pattern|No gaps
Infinity|Endless|Symbol|Limit
`),
  makePack("animals-nature", "Animals and Nature", "Creatures, habitats, and natural wonders", "🦊", "green", `
Red panda|Bamboo|Tree|Rust-colored
Axolotl|Salamander|Water|Regeneration
Octopus|Eight arms|Ink|Camouflage
Sloth|Slow|Canopy|Claws
Meerkat|Desert|Sentinel|Burrow
Narwhal|Arctic|Tusk|Whale
Koala|Eucalyptus|Australia|Pouch
Capybara|Rodent|Water|Social
Honeybee|Hive|Pollen|Dance
Chameleon|Color|Tongue|Lizard
Fennec fox|Desert|Large ears|Nocturnal
Manta ray|Ocean|Wings|Gliding
Komodo dragon|Island|Lizard|Powerful
Redwood|Tall|Coast|Ancient tree
Mangrove forest|Coastal|Roots|Nursery
Bioluminescence|Glow|Ocean|Organism
Monarch migration|Butterfly|Journey|Season
Kelp forest|Underwater|Seaweed|Habitat
Fossil|Ancient|Imprint|Rock
Tornado|Spinning|Storm|Funnel
Monsoon|Season|Heavy rain|Wind
Glacier cave|Ice|Blue|Passage
Wetland|Marsh|Birds|Shallow water
Rock pool|Shore|Tide|Small habitat
Wildflower|Bloom|Field|Pollinator
`),
  makePack("entertainment-more", "Entertainment", "Shows, games, and things worth watching", "🎭", "purple", `
Red carpet|Premiere|Photographers|Gala
Film festival|Screening|Jury|Cinema
Voice acting|Microphone|Character|Recording booth
Book club|Reading|Discussion|Monthly
Escape artist|Puzzles|Locks|Performance
Improv theater|Audience prompt|Unscripted|Comedy
Costume party|Dress-up|Theme|Guests
Talent audition|Tryout|Stage|Callback
Game show|Contestants|Prize|Host
Puppet show|Strings|Stage|Characters
Street performer|Public|Hat|Crowd
Circus|Acrobat|Tent|Ring
Opera|Singing|Orchestra|High notes
Ballet|Dance|Pointe shoes|Stage
Open mic|Newcomer|Stage|Short set
Trivia night|Questions|Teams|Points
Laser tag|Vest|Arena|Blaster
Mini golf|Windmill|Putter|Course
Bowling alley|Pins|Lane|Strike
Scavenger hunt|List|Search|Teams
Fashion show|Runway|Designers|Catwalk
Cooking competition|Kitchen|Timer|Judges
Nature documentary|Wildlife|Narrator|Camera
Award ceremony|Trophy|Speech|Applause
Interactive theater|Audience|Choice|Story
`),
  makePack("travel", "Travel", "Getting there is half the story", "🧳", "blue", `
Passport|Border|Booklet|Stamp
Boarding pass|Gate|Seat|Barcode
Layover|Airport|Wait|Connection
Road trip|Car|Playlist|Highway
Suitcase|Packing|Wheels|Luggage
Hostel|Shared room|Budget|Travelers
Cruise ship|Ocean|Deck|Vacation
Ferry|Water|Crossing|Harbor
Tour guide|Group|History|Walking
Souvenir|Keepsake|Gift shop|Memory
Itinerary|Schedule|Stops|Plan
Travel adapter|Outlet|Plug|International
Currency exchange|Money|Rate|Kiosk
Train sleeper|Bunk|Overnight|Rail
Camping trailer|Tow|Road|Outdoors
Travel journal|Notes|Trip|Writing
Map|Navigation|Folded|Route
Mountain pass|Road|Elevation|Switchbacks
Beach resort|Pool|Coast|Relaxation
Scenic overlook|View|Photo|Stop
Customs line|Arrival|Declaration|Inspection
Travel pillow|Neck|Plane|Comfort
Rental car|Keys|Counter|Driving
Carry-on bag|Cabin|Overhead|Small luggage
Walking tour|City|Guide|Streets
`),
  makePack("trends", "Trends", "What's popular right now (or was last week)", "📈", "pink", `
Unboxing|Package|Reveal|Camera
Dance challenge|Moves|Video|Repeat
Photo dump|Gallery|Casual|Snapshots
Get ready with me|Routine|Outfit|Video
Daily streak|Habit|Calendar|Consistency
Thrift flip|Secondhand|DIY|Clothes
Desk setup|Workspace|Aesthetic|Accessories
Matcha craze|Green drink|Cafe|Buzz
Short-form video|Vertical|Quick|Feed
Reaction video|Face|Watch|Response
Life hack|Tip|Shortcut|Useful
Digital detox|Offline|Break|Screen
Capsule wardrobe|Minimal|Clothes|Mix and match
Color analysis|Palette|Outfits|Undertone
Walking pad|Indoor|Steps|Desk
Plant parent|Houseplants|Care|Leaves
BookTok pick|Reading|Recommendation|Shelf
Audio trend|Sound clip|Remix|Platform
Tiny desk setup|Compact|Workspace|Organization
Retro revival|Nostalgia|Fashion|Throwback
Thrift haul|Secondhand|Finds|Shopping
Meal prep|Containers|Weekly|Kitchen
Unfiltered vlog|Casual|Daily life|Camera
Minimalist phone|Apps|Simple|Focus
Collectible blind box|Surprise|Toy|Unboxing
`),
  makePack("memes", "Memes", "Relatable internet humor, no specific quotes needed", "😂", "peach", `
Reaction image|Face|Reply|Expression
Doge|Shiba inu|Caption|Internet dog
Distracted moment|Attention|Choice|Side glance
Expectation versus reality|Plan|Outcome|Comparison
Surprised cat|Feline|Wide eyes|Reaction
Two-button dilemma|Choice|Sweat|Decision
Awkward penguin|Walk|Lonely|Antarctica
Keyboard smash|Typing|Chaos|Letters
Out-of-context screenshot|Message|Confusing|Share
Low-resolution image|Pixelated|Blurry|Compression
Relatable comic|Everyday|Panels|Punchline
Overthinking meme|Thoughts|Anxiety|Loop
Wholesome meme|Cute|Kindness|Smile
Pun image|Wordplay|Caption|Groan
Before-and-after|Change|Comparison|Transformation
Pet side-eye|Dog|Judgment|Expression
Dramatic zoom|Camera|Reaction|Emphasis
Tiny versus huge|Scale|Comparison|Difference
Loading brain|Thought|Buffering|Confusion
Chaotic group chat|Messages|Friends|Notifications
Mood board|Pictures|Vibe|Collection
Screenshot humor|Text|Context|Share
Unexpected ending|Setup|Twist|Punchline
Looping clip|Repeat|Short video|Seamless
Meme page|Feed|Captions|Scrolling
`),
];

export const AVATARS = ["🦊", "🐸", "🐼", "🐙", "🦋", "🐨", "🦄", "🐯", "🐻", "🐧", "🐰", "🦝"];

export function randomId() {
  return crypto.randomUUID();
}

export function makeCode(length = 6) {
  return Array.from({ length }, () => Math.floor(Math.random() * 10)).join("");
}
