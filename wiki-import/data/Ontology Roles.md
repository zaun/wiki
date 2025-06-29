## Role Notes:

- **Approval Requirements**: Users cannot approve their own pending edits/content
- **Domain Values**: abstract, informational, physical, mental, social, meta
- **Edit Blocking**: user:flag:no_edit prevents all content modifications regardless of other roles
- **Level Hierarchy**: Domain-specific roles grant access to the specified level and all levels below it
- **Permission Dependencies**: Some roles require other roles (e.g., content:history requires content:read)
- **Superuser Override**: admin:superuser bypasses all other permission checks

## Valid User Roles:

**Administrative Roles:**
- `admin:superuser` - Full system access, bypasses all permission checks
- `admin:edit_domains` - Can edit domain-level content (level 0)
- `admin:create_domains` - Can create new domain-level content (level 0)  
- `admin:delete_domains` - Can delete domain-level content (level 0)
- `admin:modify_roles` - Can modify user roles
- `admin:modify_reputation` - Can modify user reputation scores

**User Moderation Roles:**
- `users:warn` - Can issue warnings and add flags to users
- `users:suspend_temporary` - Can suspend users for up to 7 days
- `users:suspend_extended` - Can suspend users for up to 30 days  
- `users:ban_permanent` - Can permanently ban users

**Content Access Roles:**
- `content:read` - Basic permission to read/view content
- `content:history` - Can view content version history (requires content:read)
- `content:export` - Can export content (requires content:read)

**Domain-Specific Edit Roles (levels 1-6):**
- `edit:abstract:level[1-6]` - Can edit abstract domain content at specified level and below
- `edit:informational:level[1-6]` - Can edit informational domain content at specified level and below
- `edit:physical:level[1-6]` - Can edit physical domain content at specified level and below
- `edit:mental:level[1-6]` - Can edit mental domain content at specified level and below
- `edit:social:level[1-6]` - Can edit social domain content at specified level and below
- `edit:meta:level[1-6]` - Can edit meta domain content at specified level and below

**Domain-Specific Create Roles (levels 1-6):**
- `create:abstract:level[1-6]` - Can create abstract domain content at specified level and below
- `create:informational:level[1-6]` - Can create informational domain content at specified level and below
- `create:physical:level[1-6]` - Can create physical domain content at specified level and below
- `create:mental:level[1-6]` - Can create mental domain content at specified level and below
- `create:social:level[1-6]` - Can create social domain content at specified level and below
- `create:meta:level[1-6]` - Can create meta domain content at specified level and below

**Domain-Specific Delete Roles (levels 1-6):**
- `delete:abstract:level[1-6]` - Can delete abstract domain content at specified level and below
- `delete:informational:level[1-6]` - Can delete informational domain content at specified level and below
- `delete:physical:level[1-6]` - Can delete physical domain content at specified level and below
- `delete:mental:level[1-6]` - Can delete mental domain content at specified level and below
- `delete:social:level[1-6]` - Can delete social domain content at specified level and below
- `delete:meta:level[1-6]` - Can delete meta domain content at specified level and below

**Deep Content Roles (level 7+):**
- `edit:major_direct` - Can make direct major edits to deep content (level 7+)
- `edit:minor_direct` - Can make direct minor edits only to deep content (level 7+)
- `create:topics_basic` - Can create basic topics in deep content (level 7+)
- `delete:topics_basic` - Can delete basic topics in deep content (level 7+)

**Suggestion/Pending Roles:**
- `edit:suggest` - Can create pending edit suggestions for review (level 1+)
- `create:suggest` - Can create pending content suggestions for review (level 1+)
- `approve:pending` - Can approve pending edits and content (requires appropriate domain/level permissions)

**Move/Reorganization Roles:**
- `move:within_domain` - Can move content within the same domain
- `move:cross_domain` - Can move content between different domains

## Valid User Flags:

- `user:flag:no_edit` - Can not modify any content, regardless of other roles
- `user:flag:no_edit:abstract` - Can not modify abstract content, regardless of other roles
- `user:flag:no_edit:informational` - Can not modify informational content, regardless of other roles
- `user:flag:no_edit:physical` - Can not modify physical content, regardless of other roles
- `user:flag:no_edit:mental` - Can not modify mental content, regardless of other roles
- `user:flag:no_edit:social` - Can not modify social content, regardless of other roles
- `user:flag:no_edit:meta` - Can not modify meta content, regardless of other roles
