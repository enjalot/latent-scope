from .base import ChatModelProvider

class NLTKChatProvider(ChatModelProvider):
    def load_model(self):
        from collections import Counter
        from nltk.corpus import stopwords
        self.Counter = Counter
        self.stopwords = stopwords
        from nltk.tokenize import word_tokenize
        import nltk

        class Encoder():
            def encode(self, text):
                tokens = word_tokenize(text)
                return tokens
            def decode(self, tokens):
                return " ".join(tokens)

        nltk.download('punkt')
        nltk.download('stopwords')
        self.encoder = Encoder()

    # def chat(self, messages):
    #     # TODO: this is kind of hacky, since we aren't really using a chat model
    #     # We are slicing off the first 86 characters because it contains the prompt for LLMs
    #     text = messages[1]["content"][86:]
    #     text = text.replace("<ListItem>", "")
    #     text = text.replace("< ListItem >", "")
    #     text = text.replace("</ListItem>", "")
    #     text = text.replace("</ ListItem >", "")
    #     tokens = self.encoder.encode(text)
    #     # Remove stopwords
    #     tokens = [word for word in tokens if word.isalpha() and word.lower() not in self.stopwords.words('english')]
    #     # Get the top 3 words
    #     top_words = [word for word, count in self.Counter(tokens).most_common(self.params["top_words"])]
    #     label = " ".join(top_words)
    #     return label

    def summarize(self, items, context=""):
        text = "\n".join(items)
        tokens = self.encoder.encode(text)
        tokens = [word for word in tokens if word.isalpha() and word.lower() not in self.stopwords.words('english')]
        # Get the top 3 words
        top_words = [word for word, count in self.Counter(tokens).most_common(self.params["top_words"])]
        label = " ".join(top_words)
        return label
