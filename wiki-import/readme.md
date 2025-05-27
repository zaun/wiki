Remove everything
-----------------
MATCH (n) DETACH DELETE n

MATCH (n) RETURN n LIMIT 2500

MATCH (u:User) RETURN u
