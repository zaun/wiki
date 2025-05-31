Remove everything
-----------------
MATCH (n) DETACH DELETE n

MATCH (p:Page) DETACH DELETE p

MATCH (n) RETURN n LIMIT 2500

MATCH (u:User) RETURN u
