# OmniOntos Dual Reputation System Specification

## Table of Contents
1. [System Overview](#system-overview)
2. [Core Concepts](#core-concepts)
3. [User Roles & Permissions](#user-roles--permissions)
4. [Domain Authority System](#domain-authority-system)
5. [Reputation Scoring](#reputation-scoring)
6. [Verification System](#verification-system)
7. [Required Infrastructure](#required-infrastructure)
8. [Implementation Phases](#implementation-phases)
9. [Technical Specifications](#technical-specifications)

---

## System Overview

OmniOntos uses a **dual reputation system** combining site-wide community trust with domain-specific expertise. This prevents inappropriate cross-domain authority while encouraging quality contributions and community participation.

### Core Philosophy
- **Site-Wide Reputation:** Measures general trustworthiness, editorial skills, and community participation
- **Domain Reputation:** Measures specific expertise within individual knowledge domains
- **Both Required:** High-level permissions require both community trust AND domain expertise

---

## Core Concepts

### Reputation Types

#### Site-Wide Reputation
- Single score across entire platform
- Earned through community participation, quality editing, moderation
- Determines basic platform privileges and cross-domain capabilities
- Range: 0 to unlimited

#### Domain Reputation
- Separate score for each of the 6 domains (Abstract, Informational, Physical, Mental, Social, Meta)
- Earned through domain-specific contributions and expertise verification
- Determines content editing authority within specific domains
- Range: 0 to unlimited per domain

### Permission Logic
**Final Permission = Site-Wide Role ∩ Domain Authority**

A user needs BOTH sufficient site-wide reputation for their role AND sufficient domain reputation for domain-specific actions.

---

## User Roles & Permissions

### Site-Wide Roles (Based on Site-Wide Reputation)

#### 1. Guest (No Account)
**Capabilities:**
- Read/Search/Navigate all content
- View basic Topic statistics

#### 2. Anonymous User (WebAuthn, 0+ Site Rep)
**Capabilities:**
- All Guest capabilities
- Thumb up/down Topics (limited: 5/day)
- Create local favorite lists
- View Topic history

#### 3. Verified User (Email+ Verification, 25+ Site Rep)
**Capabilities:**
- All Anonymous User capabilities
- Unlimited Topic ratings
- Cloud-synced favorites
- Read-only access to talk/forum pages
- Basic content flagging (2 flags/day)

#### 4. Contributor (75+ Site Rep)
**Capabilities:**
- All Verified User capabilities
- Add to talk/forum discussions
- Enhanced flagging (5 flags/day)
- Suggest edits (any domain, reviewed)
- View public reputation scores

#### 5. Editor (200+ Site Rep)
**Capabilities:**
- All Contributor capabilities
- Edit existing Topic content (subject to domain authority)
- Create new Topics (subject to domain authority)
- Upload/manage images
- Direct minor edits (skip review for small changes)

#### 6. Reviewer (500+ Site Rep)
**Capabilities:**
- All Editor capabilities
- Review suggested edits (any domain)
- Revert changes (any domain)
- Review flagged content
- Move Topics within same domain

#### 7. Moderator (1000+ Site Rep + Community Election)
**Capabilities:**
- All Reviewer capabilities
- Lock individual Topics (any domain)
- Issue user warnings
- Cross-domain Topic moves
- Access moderation logs

#### 8. Administrator (Appointed)
**Capabilities:**
- Full system access
- User account management
- System configuration
- Policy modification

---

## Domain Authority System

### Domain Authority Levels (Per Domain)

#### Domain Novice (0-99 Domain Rep)
- Can contribute to Level 6+ Topics in domain
- Standard review process for all edits
- Can suggest edits for higher-level Topics

#### Domain Contributor (100-299 Domain Rep)
- Can create/edit Level 5 Topics in domain
- Reduced review requirements for minor edits
- Can approve suggested edits for Level 6+ Topics

#### Domain Expert (300-699 Domain Rep)
- Can edit Level 3-4 Topics in domain
- Fast-track approval for domain contributions
- Can mentor new contributors in domain
- Authority to approve Level 5+ edits

#### Domain Authority (700+ Domain Rep)
- Can edit Level 1-2 Topics in domain
- Can lock Topic hierarchies in domain
- Final approval authority for domain content disputes
- Can approve edits at any level in domain

### Topic Level Editing Matrix

| Domain Authority | Can Edit Levels | Can Create Levels | Review Authority |
|------------------|-----------------|-------------------|------------------|
| **Novice (0-99)** | 6+ | 6+ | Suggest only |
| **Contributor (100-299)** | 5+ | 5+ | Level 6+ |
| **Expert (300-699)** | 3+ | 4+ | Level 5+ |
| **Authority (700+)** | 1+ | 2+ | All levels |

---

## Reputation Scoring

### Site-Wide Reputation Gains

| Action | Points | Daily Cap | Notes |
|--------|--------|-----------|-------|
| **Content Quality** | | | |
| Minor edit approved | +5 | 25 | Grammar, formatting |
| Major edit approved | +15 | 50 | Substantial content |
| New Topic created | +25 | 75 | Original content |
| **Community Participation** | | | |
| Quality flag (upheld) | +5 | 15 | Identifying issues |
| Helpful talk contribution | +3 | 15 | Constructive discussion |
| Successful edit review | +2 | 20 | Quality control |
| **Leadership** | | | |
| Mentor new contributor | +20 | N/A | Teaching/guidance |
| Cross-domain collaboration | +10 | N/A | System thinking |
| Policy contribution | +15 | N/A | Community governance |

### Domain Reputation Gains

| Action | Points | Daily Cap | Notes |
|--------|--------|-----------|-------|
| **Domain Expertise** | | | |
| Domain-specific edit | +10-25 | 50 | Based on Topic level |
| Expert peer endorsement | +50 | N/A | Peer recognition |
| Verification credential | +100-300 | N/A | Initial verification bonus |
| **Knowledge Sharing** | | | |
| Explain complex concept | +15 | 30 | Educational content |
| Cite authoritative sources | +5 | 15 | Scholarly approach |
| Domain cross-reference | +8 | 24 | Connecting knowledge |

### Reputation Losses

| Action | Site-Wide | Domain | Notes |
|--------|-----------|---------|-------|
| **Content Issues** | | | |
| Edit reverted (minor) | -3 | -5 | Factual errors |
| Edit reverted (major) | -10 | -15 | Significant issues |
| Edit reverted (bias) | -15 | -20 | POV pushing |
| **Community Violations** | | | |
| Spam/inappropriate | -15 | -10 | Commercial, off-topic |
| Personal attacks | -25 | -15 | Harassment |
| False flagging | -5 | -3 | Misuse of reporting |
| **System Abuse** | | | |
| Gaming reputation | -100 | -50 | Vote manipulation |
| Sock-puppeting | -200 | -100 | Multiple accounts |
| Verification fraud | -500 | -300 | False credentials |

### Reputation Protection
- **Daily loss cap:** Maximum -50 site-wide, -30 domain per day
- **Appeals process:** Disputed penalties reviewed by Moderators+
- **Recovery bonus:** 1.2x gains for 30 days after penalty resolution

---

## Verification System

### Account Types & Verification Levels

#### WebAuthn Base (All Accounts)
- Cryptographic key authentication
- Prevents sock-puppeting
- Privacy-preserving foundation

#### Verification Tiers

##### Email Verified (+25 Site Rep, 1.1x multiplier)
- Email address verification
- Account recovery enabled
- Enhanced platform features

##### Profile Enhanced (+50 Site Rep, 1.2x multiplier)
- Optional personal information
- Profile photo/bio
- Community engagement features

##### Professional Verified (+100 Site Rep, varies by domain)
- Academic credentials (university email, ORCID)
- Industry verification (LinkedIn, certifications)
- Domain-specific reputation bonuses

##### Expert Verified (+200 Site Rep, +300-500 Domain Rep)
- Peer endorsement from existing experts
- Publication/research record
- Significant domain authority boost

### Verification to Domain Mapping

| Verification Type | Primary Domain | Secondary Domains | Bonus Rep |
|-------------------|----------------|-------------------|-----------|
| **PhD Mathematics** | Abstract +300 | Physical +100 | Site +150 |
| **Computer Science PhD** | Abstract +300 | Informational +200 | Site +150 |
| **MD/Medical Doctor** | Physical +300 | Mental +100 | Site +150 |
| **Licensed Psychologist** | Mental +300 | Social +100 | Site +150 |
| **Economics PhD** | Social +300 | Abstract +200 | Site +150 |
| **Engineering PhD** | Physical +250 | Abstract +150 | Site +125 |
| **Philosophy PhD** | Meta +300 | Abstract +150 | Site +150 |
| **Library Science** | Informational +200 | Meta +150 | Site +100 |

---

## Required Infrastructure

### Core Platform Features

#### User Management System
- **WebAuthn Integration**
  - Key generation and storage
  - Authentication flow
  - Account recovery mechanisms
- **Profile Management**
  - Basic profile information
  - Privacy controls
  - Verification status display
- **Session Management**
  - Secure session handling
  - Multi-device support
  - Activity logging

#### Content Management System
- **Topic CRUD Operations**
  - Create, read, update, delete Topics
  - Section and Detail management
  - Content versioning
- **Hierarchy Management**
  - Parent-child relationships
  - Domain boundaries
  - Level tracking (1-6+)
- **Edit History**
  - Complete change tracking
  - Diff visualization
  - Rollback capabilities

#### Permission Engine
- **Role-Based Access Control**
  - Site-wide role checking
  - Domain authority validation
  - Permission inheritance
- **Dynamic Permission Calculation**
  - Real-time reputation checking
  - Domain-specific rules
  - Action-based validation

### Reputation-Specific Features

#### Flagging System
**Flag Types:**
- **Accuracy Issues**
  - Factual errors
  - Outdated information
  - Missing citations
- **Quality Issues**
  - Poor writing/grammar
  - Unclear explanations
  - Incomplete content
- **Policy Violations**
  - Bias/POV pushing
  - Spam/commercial content
  - Inappropriate content
- **Technical Issues**
  - Broken links/images
  - Formatting problems
  - Classification errors

**Flag Workflow:**
1. User submits flag with category and description
2. Flag enters review queue
3. Reviewer investigates and takes action
4. Reputation adjustments applied
5. User feedback provided

#### Edit Classification System
**Edit Types for Reputation Calculation:**
- **Typo/Grammar** (+2-5 points)
  - Simple text corrections
  - Formatting improvements
  - Punctuation fixes
- **Content Addition** (+10-25 points)
  - New information added
  - Examples/explanations added
  - Citations/references added
- **Content Revision** (+5-15 points)
  - Accuracy improvements
  - Clarity enhancements
  - Reorganization/restructuring
- **Major Overhaul** (+20-50 points)
  - Complete section rewrites
  - Comprehensive updates
  - Structural improvements

#### Rating System
**Topic Quality Ratings:**
- **5-Star Rating Scale**
  - 1 Star: Poor quality, needs major work
  - 2 Stars: Below average, some issues
  - 3 Stars: Average quality
  - 4 Stars: Good quality, minor issues
  - 5 Stars: Excellent quality
- **Weighted by User Reputation**
  - Higher reputation users' ratings weighted more heavily
  - Prevents gaming by new accounts
  - Domain expertise considered for domain topics

#### Talk/Forum System
**Features Required:**
- **Topic-Specific Discussion Pages**
  - Threaded conversations
  - Reply system
  - Mention notifications
- **Moderation Tools**
  - Comment removal/editing
  - User warnings/bans
  - Content flagging
- **Quality Metrics**
  - Helpful/unhelpful voting
  - Best answer selection
  - Contribution tracking

### Verification Infrastructure

#### Email Verification
- **SMTP Integration**
  - Verification email sending
  - Template management
  - Delivery tracking
- **Verification Workflow**
  - Token generation
  - Expiration handling
  - Confirmation processing

#### Professional Verification
- **Academic Integration**
  - University email validation
  - ORCID API integration
  - Publication verification
- **Industry Verification**
  - LinkedIn API integration  
  - Professional association APIs
  - Certification body verification
- **Manual Review Process**
  - Document upload system
  - Admin review interface
  - Approval workflow

#### Expert Endorsement System
- **Peer Recommendation**
  - Endorsement requests
  - Multi-step approval
  - Community review period
- **Publication Tracking**
  - ORCID integration
  - Citation analysis
  - Research impact metrics

### Analytics & Monitoring

#### Reputation Analytics
- **User Dashboards**
  - Reputation breakdown by source
  - Domain expertise visualization
  - Contribution history
- **System Metrics**
  - Reputation distribution analysis
  - Gaming detection algorithms
  - Quality trend monitoring

#### Community Health Metrics
- **Content Quality Tracking**
  - Average Topic ratings
  - Edit approval rates
  - Flag resolution time
- **User Engagement Metrics**
  - Active contributor counts
  - Cross-domain collaboration
  - Community retention rates

#### Fraud Detection
- **Automated Detection**
  - Sock-puppet identification
  - Vote manipulation detection
  - Unusual activity patterns
- **Investigation Tools**
  - User activity correlation
  - Network analysis
  - Behavioral pattern matching

### Administrative Tools

#### User Management
- **Account Administration**
  - User search and filtering
  - Reputation adjustment tools
  - Suspension/ban management
- **Verification Management**
  - Verification queue
  - Credential validation tools
  - Expert endorsement tracking

#### Content Moderation
- **Flag Management**
  - Flag queue prioritization
  - Batch processing tools
  - Resolution tracking
- **Quality Control**
  - Bulk edit tools
  - Content review workflows
  - Standards enforcement

#### System Configuration
- **Reputation Tuning**
  - Point value adjustments
  - Threshold modifications
  - Multiplier calibration
- **Policy Management**
  - Rule definition interface
  - Change tracking
  - Community communication

---

## Implementation Phases

### Phase 1: Foundation (MVP)
**Duration:** 3-4 months

**Core Features:**
- WebAuthn authentication system
- Basic user profiles and email verification
- Topic CRUD with simple edit tracking
- Basic reputation scoring (site-wide only)
- Simple role system (Guest → Anonymous → Verified → Editor)
- Basic flagging system

**Success Criteria:**
- Users can create accounts and verify emails
- Basic content editing with reputation tracking
- Simple quality control through flagging

### Phase 2: Community Features
**Duration:** 2-3 months

**Added Features:**
- Talk/forum system for Topics
- Enhanced flagging with categorization
- Edit classification and differential scoring
- Cross-domain reputation tracking
- Review and approval workflows
- Rating system for Topics

**Success Criteria:**
- Active community discussions
- Quality-based reputation differentiation
- Effective content review process

### Phase 3: Domain Authority
**Duration:** 3-4 months

**Added Features:**
- Full dual reputation system
- Domain-specific permissions
- Professional verification system
- Expert endorsement workflows
- Advanced moderation tools
- Comprehensive analytics

**Success Criteria:**
- Domain experts effectively managing specialized content
- Clear expertise-based authority
- Robust verification system

### Phase 4: Advanced Features
**Duration:** 2-3 months

**Added Features:**
- AI-assisted quality scoring integration
- Advanced fraud detection
- Sophisticated analytics dashboards
- Expert mentorship programs
- Cross-platform verification integration

**Success Criteria:**
- Automated quality maintenance
- Mature community governance
- Scalable expert development

---

## Technical Specifications

### Database Schema Requirements

#### Users Table
```sql
CREATE TABLE users (
    id UUID PRIMARY KEY,
    webauthn_key TEXT NOT NULL UNIQUE,
    email TEXT UNIQUE,
    email_verified BOOLEAN DEFAULT FALSE,
    profile_data JSONB,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);
```

#### Reputation Table
```sql
CREATE TABLE user_reputation (
    user_id UUID REFERENCES users(id),
    site_wide_reputation INTEGER DEFAULT 0,
    abstract_reputation INTEGER DEFAULT 0,
    informational_reputation INTEGER DEFAULT 0,
    physical_reputation INTEGER DEFAULT 0,
    mental_reputation INTEGER DEFAULT 0,
    social_reputation INTEGER DEFAULT 0,
    meta_reputation INTEGER DEFAULT 0,
    updated_at TIMESTAMP DEFAULT NOW(),
    PRIMARY KEY (user_id)
);
```

#### Reputation Events Table
```sql
CREATE TABLE reputation_events (
    id UUID PRIMARY KEY,
    user_id UUID REFERENCES users(id),
    event_type VARCHAR(50) NOT NULL,
    site_wide_change INTEGER DEFAULT 0,
    domain_changes JSONB,
    reason TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    created_by UUID REFERENCES users(id)
);
```

#### Verifications Table
```sql
CREATE TABLE user_verifications (
    id UUID PRIMARY KEY,
    user_id UUID REFERENCES users(id),
    verification_type VARCHAR(50) NOT NULL,
    verification_data JSONB,
    verified_at TIMESTAMP,
    verified_by UUID REFERENCES users(id),
    status VARCHAR(20) DEFAULT 'pending'
);
```

### API Endpoints Required

#### Reputation Management
- `GET /api/users/{id}/reputation` - Get user reputation breakdown
- `POST /api/reputation/events` - Record reputation change
- `GET /api/reputation/leaderboard` - Domain/site-wide leaderboards

#### Permission Checking
- `GET /api/users/{id}/permissions` - Get user's current permissions
- `POST /api/permissions/check` - Check specific permission for action

#### Verification System
- `POST /api/verification/email` - Initiate email verification
- `POST /api/verification/professional` - Submit professional verification
- `GET /api/verification/status` - Check verification status

#### Content Management Integration
- `POST /api/topics/{id}/flag` - Flag content
- `POST /api/topics/{id}/rate` - Rate Topic quality
- `GET /api/topics/{id}/permissions` - Get user's permissions for Topic

### Performance Requirements

#### Response Time Targets
- Permission checks: < 100ms
- Reputation queries: < 200ms
- Verification workflows: < 500ms

#### Scalability Targets
- Support 100,000+ registered users
- Handle 1,000+ concurrent active users
- Process 10,000+ reputation events/day

#### Availability Requirements
- 99.9% uptime for core reputation system
- Graceful degradation for non-critical features
- Real-time reputation updates

---

## Success Metrics

### Community Health
- **Active Contributor Growth:** 15% month-over-month
- **Cross-Domain Collaboration:** 25% of edits involve multiple domains
- **Quality Improvement:** Average Topic ratings increase over time

### System Effectiveness
- **Gaming Prevention:** < 1% of reputation changes flagged as suspicious
- **Expert Engagement:** 80%+ of verified experts actively contributing
- **Community Trust:** User satisfaction > 4.0/5.0 in surveys

### Technical Performance
- **System Reliability:** 99.9% uptime
- **Response Performance:** All API calls < target response times
- **Data Integrity:** Zero reputation calculation errors

This specification provides the complete foundation for implementing OmniOntos's dual reputation system, ensuring both community trust and domain expertise are properly recognized and leveraged.

## User Roles

# OmniOntos Granular Role System

## Philosophy
Each role grants access to **exactly one specific capability**. Users accumulate multiple roles as their reputation increases, creating a modular permission system that allows fine-grained control and clear progression paths.

