import outlines

@outlines.prompt
def summarize(items, context=""):
  """
You're job is to summarize lists of items with a short label of no more than 4 words. The items are part of a cluster and the label will be used to distinguish this cluster from others, so pay attention to what makes this group of similar items distinct.
{{context}}

Items
--------

{% for item in items%}
<Item>{{ item }}</Item>
{% endfor %}

Task
--------
Choose a label that best summarizes the theme of the list so that someone browsing the labels will have a good idea of what is in the list. 
Do not use punctuation, Do not explain yourself, respond with only a few words that summarize the list.

Label:"""
