"""Build a tiny, topically-clustered CSV for the ColBERT late-interaction demo.

Six clearly-separated topics so similarity search results are easy to eyeball:
a query about bread should surface the cooking rows, a query about black holes
the space rows, and so on. Small enough to embed on CPU in well under a minute.
"""
import csv
import os

TOPICS = {
    "cooking": [
        "Knead the dough for ten minutes until it becomes smooth and elastic.",
        "Let the bread rise in a warm place until it doubles in size.",
        "Preheat the oven to 450 degrees before baking the sourdough loaf.",
        "A pinch of salt balances the sweetness in most dessert recipes.",
        "Caramelize the onions slowly over low heat for a rich flavor.",
        "Whisk the eggs and sugar together until the mixture turns pale.",
        "Simmer the tomato sauce for an hour to deepen its flavor.",
        "Fresh basil and garlic make a simple pasta taste incredible.",
        "Rest the steak for five minutes so the juices redistribute.",
        "Fold the flour gently into the batter to keep the cake light.",
        "Toast the spices in a dry pan to release their aroma.",
        "Brining the chicken overnight keeps the meat moist and tender.",
    ],
    "space": [
        "A black hole's gravity is so strong that not even light escapes.",
        "The James Webb telescope captures infrared light from distant galaxies.",
        "Mars has the largest volcano in the solar system, Olympus Mons.",
        "Neutron stars are the dense remnants of collapsed massive stars.",
        "The Milky Way contains hundreds of billions of stars.",
        "A light year measures the distance light travels in one year.",
        "Saturn's rings are made mostly of ice and rocky debris.",
        "Astronauts experience weightlessness because they are in free fall.",
        "The Sun fuses hydrogen into helium deep in its core.",
        "Exoplanets are planets that orbit stars beyond our solar system.",
        "A supernova briefly outshines an entire galaxy when a star explodes.",
        "The cosmic microwave background is the afterglow of the Big Bang.",
    ],
    "finance": [
        "Diversifying a portfolio reduces the risk of any single investment.",
        "Compound interest lets your savings grow exponentially over time.",
        "Index funds track a market benchmark with low management fees.",
        "Inflation erodes the purchasing power of cash over the years.",
        "A bond pays periodic interest and returns the principal at maturity.",
        "Dollar cost averaging smooths out the impact of market volatility.",
        "Central banks raise interest rates to cool down an overheated economy.",
        "An emergency fund should cover several months of living expenses.",
        "Equities historically outperform bonds over long time horizons.",
        "Credit card debt carries some of the highest interest rates around.",
        "A balance sheet lists a company's assets and its liabilities.",
        "Rebalancing keeps your asset allocation aligned with your goals.",
    ],
    "sports": [
        "The striker curled the free kick into the top corner of the net.",
        "A marathon runner paces carefully to avoid hitting the wall.",
        "The point guard threaded a no-look pass to the open shooter.",
        "Tennis players grunt as they unleash a powerful forehand winner.",
        "The pitcher threw a fastball right past the swinging batter.",
        "Cyclists draft behind one another to conserve energy in a peloton.",
        "The goalkeeper dove full stretch to tip the shot around the post.",
        "A boxer relies on footwork to stay out of range of punches.",
        "The sprinter exploded out of the blocks at the sound of the gun.",
        "Swimmers flip turn at the wall to keep their momentum going.",
        "The quarterback launched a deep pass into the end zone.",
        "Climbers chalk their hands for grip on the steep rock face.",
    ],
    "programming": [
        "A hash map gives average constant time lookups by key.",
        "Recursion solves a problem by calling the function on smaller inputs.",
        "Unit tests catch regressions before they reach production.",
        "Git lets developers branch, merge, and track changes over time.",
        "A memory leak happens when allocated memory is never released.",
        "Big O notation describes how an algorithm scales with input size.",
        "Compilers translate human-readable code into machine instructions.",
        "An API defines how two software systems talk to each other.",
        "Caching stores expensive results so they can be reused quickly.",
        "A race condition occurs when threads access shared state unsafely.",
        "Static types catch many errors at compile time instead of runtime.",
        "Indexes speed up database queries at the cost of slower writes.",
    ],
    "gardening": [
        "Water tomato plants deeply at the base to encourage strong roots.",
        "Compost enriches the soil with nutrients as it breaks down.",
        "Prune the rose bushes in early spring to promote new growth.",
        "Mulch helps the soil retain moisture during the hot summer months.",
        "Pollinators like bees are essential for a productive vegetable garden.",
        "Rotate your crops each season to keep the soil healthy.",
        "Seedlings need plenty of sunlight to grow sturdy and green.",
        "Pull weeds early before they compete with your plants for nutrients.",
        "A trellis supports climbing beans and cucumbers as they grow.",
        "Test the soil pH before planting acid-loving blueberries.",
        "Deadhead spent flowers to encourage the plant to bloom again.",
        "Raised beds improve drainage and warm up earlier in the spring.",
    ],
}


def main():
    out_dir = os.path.dirname(os.path.abspath(__file__))
    out_path = os.path.join(out_dir, "colbert_sentences.csv")
    rows = []
    for topic, sentences in TOPICS.items():
        for s in sentences:
            rows.append({"text": s, "topic": topic})
    with open(out_path, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=["text", "topic"])
        writer.writeheader()
        writer.writerows(rows)
    print(f"wrote {len(rows)} rows across {len(TOPICS)} topics to {out_path}")


if __name__ == "__main__":
    main()
