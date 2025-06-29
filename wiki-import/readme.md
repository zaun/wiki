Remove everything
-----------------
MATCH (n) DETACH DELETE n

MATCH (p:Page) DETACH DELETE p

MATCH (n) RETURN n LIMIT 2500
MATCH (n:Node) WHERE n.status = 'complete' RETURN n LIMIT 25000
MATCH (n:Node) WHERE n.status = 'complete' OR n.status = 'stub' RETURN n LIMIT 25000

MATCH (u:User) RETURN u
