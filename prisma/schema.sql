-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "whopId" TEXT,
    "whopUsername" TEXT,
    "whopAvatarUrl" TEXT,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "plan" TEXT NOT NULL DEFAULT 'FREE',
    "planSource" TEXT NOT NULL DEFAULT 'default',
    "planUpdatedAt" DATETIME,
    "memeArmyPlan" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "linksSavedAt" DATETIME,
    "refCode" TEXT,
    "referredById" TEXT,
    "freeGenBalance" INTEGER NOT NULL DEFAULT 0,
    "freeGenMonth" TEXT,
    "freeGenApplied" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "User_referredById_fkey" FOREIGN KEY ("referredById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "BrandProfile" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "website" TEXT,
    "industry" TEXT,
    "description" TEXT,
    "products" TEXT,
    "audience" TEXT,
    "voice" TEXT,
    "languages" TEXT NOT NULL DEFAULT '["en"]',
    "cta" TEXT,
    "links" TEXT,
    "researchJson" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "BrandProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Campaign" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "businessName" TEXT NOT NULL,
    "website" TEXT,
    "sourceType" TEXT NOT NULL DEFAULT 'URL',
    "profileJson" TEXT NOT NULL DEFAULT '{}',
    "objective" TEXT NOT NULL,
    "customObjective" TEXT,
    "tone" TEXT NOT NULL,
    "customTone" TEXT,
    "languages" TEXT NOT NULL DEFAULT '["en"]',
    "formats" TEXT NOT NULL DEFAULT '[]',
    "piecesPerFormat" INTEGER NOT NULL DEFAULT 2,
    "status" TEXT NOT NULL DEFAULT 'GENERATING',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Campaign_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Asset" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "campaignId" TEXT,
    "type" TEXT NOT NULL,
    "format" TEXT NOT NULL,
    "formatLabel" TEXT NOT NULL,
    "language" TEXT NOT NULL DEFAULT 'en',
    "languageLabel" TEXT NOT NULL DEFAULT 'English',
    "title" TEXT NOT NULL DEFAULT '',
    "body" TEXT NOT NULL DEFAULT '',
    "topText" TEXT,
    "bottomText" TEXT,
    "imageUrl" TEXT,
    "pageUrl" TEXT,
    "engineRef" TEXT,
    "objective" TEXT,
    "tone" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "error" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Asset_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Asset_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "GenerationJob" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'QUEUED',
    "total" INTEGER NOT NULL DEFAULT 0,
    "done" INTEGER NOT NULL DEFAULT 0,
    "failed" INTEGER NOT NULL DEFAULT 0,
    "currentStep" TEXT,
    "error" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "GenerationJob_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "GenerationJob_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "WebhookEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "type" TEXT NOT NULL,
    "payload" TEXT NOT NULL DEFAULT '{}',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "UsageRecord" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 1,
    "meta" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "UsageRecord_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "GameProfile" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "xp" INTEGER NOT NULL DEFAULT 0,
    "streakDays" INTEGER NOT NULL DEFAULT 0,
    "lastActiveOn" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "GameProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "XpEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "meta" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "XpEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "HiredAgent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "templateKey" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "tokenBudget" INTEGER NOT NULL,
    "tokensUsed" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "source" TEXT NOT NULL DEFAULT 'RENTAL',
    "expiresAt" DATETIME,
    "agent37Ref" TEXT,
    "role" TEXT,
    "instructions" TEXT,
    "toolsJson" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "HiredAgent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AgentJob" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "hireId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "brief" TEXT NOT NULL,
    "language" TEXT NOT NULL DEFAULT 'en',
    "pieces" INTEGER NOT NULL DEFAULT 1,
    "tokenCost" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'QUEUED',
    "result" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "AgentJob_hireId_fkey" FOREIGN KEY ("hireId") REFERENCES "HiredAgent" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "AgentJob_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CampaignListing" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "posterId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "bountyTokens" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "assigneeId" TEXT,
    "jobId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CampaignListing_posterId_fkey" FOREIGN KEY ("posterId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ReferralEarning" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "referrerId" TEXT NOT NULL,
    "recruitId" TEXT NOT NULL,
    "basisPlan" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'SIMULATED',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ReferralEarning_referrerId_fkey" FOREIGN KEY ("referrerId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ReferralEarning_recruitId_fkey" FOREIGN KEY ("recruitId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "RoutingPolicy" (
    "tier" TEXT NOT NULL PRIMARY KEY,
    "model" TEXT NOT NULL,
    "updatedAt" DATETIME NOT NULL,
    "updatedBy" TEXT
);

-- CreateTable
CREATE TABLE "ArmyBot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "armyName" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "logoUrl" TEXT,
    "colorPrimary" TEXT NOT NULL DEFAULT '#FF5C1A',
    "colorSecondary" TEXT NOT NULL DEFAULT '#111111',
    "website" TEXT,
    "botToken" TEXT NOT NULL,
    "botUsername" TEXT,
    "telegramBotId" TEXT,
    "webhookUrl" TEXT,
    "webhookStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "secretToken" TEXT,
    "groupId" TEXT,
    "groupTitle" TEXT,
    "languages" TEXT NOT NULL DEFAULT '["en","es"]',
    "welcomeMessage" TEXT,
    "rewardsJson" TEXT NOT NULL DEFAULT '[]',
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "demoSeeded" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ArmyBot_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Mission" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "botId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "product" TEXT,
    "description" TEXT NOT NULL,
    "targetUrl" TEXT,
    "audience" TEXT,
    "languages" TEXT NOT NULL DEFAULT '["en"]',
    "durationDays" INTEGER NOT NULL DEFAULT 7,
    "dailyRequirement" TEXT,
    "rewardBudget" TEXT,
    "rules" TEXT,
    "contentPackJson" TEXT NOT NULL DEFAULT '[]',
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "announcedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Mission_botId_fkey" FOREIGN KEY ("botId") REFERENCES "ArmyBot" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ArmyMember" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "botId" TEXT NOT NULL,
    "telegramId" TEXT NOT NULL,
    "username" TEXT,
    "displayName" TEXT NOT NULL,
    "language" TEXT NOT NULL DEFAULT 'en',
    "points" INTEGER NOT NULL DEFAULT 0,
    "shares" INTEGER NOT NULL DEFAULT 0,
    "referrals" INTEGER NOT NULL DEFAULT 0,
    "clicks" INTEGER NOT NULL DEFAULT 0,
    "verifiedClicks" INTEGER NOT NULL DEFAULT 0,
    "badges" TEXT NOT NULL DEFAULT '[]',
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "refCode" TEXT,
    "joinedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ArmyMember_botId_fkey" FOREIGN KEY ("botId") REFERENCES "ArmyBot" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Submission" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "botId" TEXT NOT NULL,
    "missionId" TEXT,
    "memberId" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'LINK',
    "payload" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "clicks" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Submission_botId_fkey" FOREIGN KEY ("botId") REFERENCES "ArmyBot" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Submission_missionId_fkey" FOREIGN KEY ("missionId") REFERENCES "Mission" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Submission_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "ArmyMember" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "VideoJob" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "format" TEXT NOT NULL,
    "paramsJson" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'RUNNING',
    "engineJobId" TEXT,
    "engineKind" TEXT,
    "pageUrl" TEXT,
    "shareUrl" TEXT,
    "error" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "VideoJob_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ResearchJob" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "brandName" TEXT NOT NULL,
    "website" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'running',
    "resultJson" TEXT,
    "error" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ResearchJob_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "EngineLink" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "partner" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "EngineLink_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "BridgeConnection" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "botPlan" TEXT NOT NULL,
    "period" TEXT,
    "credits" INTEGER,
    "granted" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "lastFetchedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "BridgeConnection_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "BridgeCode" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "budgetCredits" INTEGER NOT NULL,
    "scope" TEXT NOT NULL DEFAULT 'week',
    "expiresAt" DATETIME NOT NULL,
    "usedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "BridgeCode_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "BridgeToken" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "budgetCredits" INTEGER NOT NULL,
    "scope" TEXT NOT NULL DEFAULT 'week',
    "spentCredits" INTEGER NOT NULL DEFAULT 0,
    "pendingCredits" INTEGER NOT NULL DEFAULT 0,
    "pendingSince" DATETIME,
    "expiresAt" DATETIME NOT NULL,
    "revokedAt" DATETIME,
    "lastUsedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "BridgeToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "RotatorDay" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "date" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "winnerUserId" TEXT,
    "winnerPartner" TEXT,
    "winnerUrl" TEXT,
    "winningBid" INTEGER,
    "gensDeducted" BOOLEAN NOT NULL DEFAULT false,
    "confirmedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "RotatorDay_winnerUserId_fkey" FOREIGN KEY ("winnerUserId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "RotatorBid" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "dayId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "partner" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "RotatorBid_dayId_fkey" FOREIGN KEY ("dayId") REFERENCES "RotatorDay" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "RotatorBid_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "RotatorPlacement" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "partner" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "url" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RotatorPlacement_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TrendDay" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "date" TEXT NOT NULL,
    "lang" TEXT NOT NULL,
    "topicsJson" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "DoorsSession" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "gameDate" TEXT NOT NULL,
    "language" TEXT NOT NULL DEFAULT 'en',
    "caller" TEXT NOT NULL,
    "keeperDoor" INTEGER NOT NULL,
    "assignment" JSONB NOT NULL,
    "commitmentHash" TEXT NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'opening',
    "opened" JSONB NOT NULL DEFAULT [],
    "offers" JSONB NOT NULL DEFAULT [],
    "streak" INTEGER NOT NULL DEFAULT 0,
    "bestStreak" INTEGER NOT NULL DEFAULT 0,
    "peeksBanked" INTEGER NOT NULL DEFAULT 0,
    "peeksUsed" JSONB NOT NULL DEFAULT [],
    "sweatArmed" BOOLEAN NOT NULL DEFAULT false,
    "calls" JSONB NOT NULL DEFAULT [],
    "readGuess" TEXT,
    "result" JSONB,
    "prizeGensAwarded" INTEGER NOT NULL DEFAULT 0,
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" DATETIME,
    CONSTRAINT "DoorsSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DoorsDailySet" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "gameDate" TEXT NOT NULL,
    "language" TEXT NOT NULL,
    "memes" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'live',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "BidPointEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "points" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "refUserId" TEXT,
    "auctionId" TEXT,
    "meta" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "BidPointEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "KeyAuction" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "weekKey" TEXT NOT NULL,
    "prizeLabel" TEXT NOT NULL,
    "opensAt" DATETIME NOT NULL,
    "closesAt" DATETIME NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "winnerId" TEXT,
    "winningBid" INTEGER,
    "closedAt" DATETIME,
    "fulfilledAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "KeyAuction_winnerId_fkey" FOREIGN KEY ("winnerId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "KeyBid" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "auctionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "points" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "KeyBid_auctionId_fkey" FOREIGN KEY ("auctionId") REFERENCES "KeyAuction" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "KeyBid_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "User_whopId_key" ON "User"("whopId");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_refCode_key" ON "User"("refCode");

-- CreateIndex
CREATE INDEX "BrandProfile_userId_idx" ON "BrandProfile"("userId");

-- CreateIndex
CREATE INDEX "Campaign_userId_idx" ON "Campaign"("userId");

-- CreateIndex
CREATE INDEX "Asset_userId_idx" ON "Asset"("userId");

-- CreateIndex
CREATE INDEX "Asset_campaignId_idx" ON "Asset"("campaignId");

-- CreateIndex
CREATE INDEX "GenerationJob_userId_idx" ON "GenerationJob"("userId");

-- CreateIndex
CREATE INDEX "WebhookEvent_createdAt_idx" ON "WebhookEvent"("createdAt");

-- CreateIndex
CREATE INDEX "UsageRecord_userId_idx" ON "UsageRecord"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "GameProfile_userId_key" ON "GameProfile"("userId");

-- CreateIndex
CREATE INDEX "XpEvent_userId_idx" ON "XpEvent"("userId");

-- CreateIndex
CREATE INDEX "XpEvent_userId_kind_idx" ON "XpEvent"("userId", "kind");

-- CreateIndex
CREATE INDEX "HiredAgent_userId_idx" ON "HiredAgent"("userId");

-- CreateIndex
CREATE INDEX "AgentJob_userId_idx" ON "AgentJob"("userId");

-- CreateIndex
CREATE INDEX "AgentJob_hireId_idx" ON "AgentJob"("hireId");

-- CreateIndex
CREATE INDEX "CampaignListing_posterId_idx" ON "CampaignListing"("posterId");

-- CreateIndex
CREATE INDEX "CampaignListing_status_idx" ON "CampaignListing"("status");

-- CreateIndex
CREATE UNIQUE INDEX "ReferralEarning_recruitId_key" ON "ReferralEarning"("recruitId");

-- CreateIndex
CREATE INDEX "ReferralEarning_referrerId_idx" ON "ReferralEarning"("referrerId");

-- CreateIndex
CREATE UNIQUE INDEX "ArmyBot_userId_key" ON "ArmyBot"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "ArmyBot_slug_key" ON "ArmyBot"("slug");

-- CreateIndex
CREATE INDEX "ArmyBot_userId_idx" ON "ArmyBot"("userId");

-- CreateIndex
CREATE INDEX "Mission_botId_idx" ON "Mission"("botId");

-- CreateIndex
CREATE INDEX "ArmyMember_botId_idx" ON "ArmyMember"("botId");

-- CreateIndex
CREATE UNIQUE INDEX "ArmyMember_botId_telegramId_key" ON "ArmyMember"("botId", "telegramId");

-- CreateIndex
CREATE INDEX "Submission_botId_idx" ON "Submission"("botId");

-- CreateIndex
CREATE INDEX "Submission_missionId_idx" ON "Submission"("missionId");

-- CreateIndex
CREATE INDEX "VideoJob_userId_idx" ON "VideoJob"("userId");

-- CreateIndex
CREATE INDEX "ResearchJob_userId_website_idx" ON "ResearchJob"("userId", "website");

-- CreateIndex
CREATE INDEX "ResearchJob_userId_createdAt_idx" ON "ResearchJob"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "EngineLink_userId_idx" ON "EngineLink"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "EngineLink_userId_partner_key" ON "EngineLink"("userId", "partner");

-- CreateIndex
CREATE UNIQUE INDEX "BridgeConnection_userId_key" ON "BridgeConnection"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "BridgeCode_codeHash_key" ON "BridgeCode"("codeHash");

-- CreateIndex
CREATE INDEX "BridgeCode_userId_idx" ON "BridgeCode"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "BridgeToken_tokenHash_key" ON "BridgeToken"("tokenHash");

-- CreateIndex
CREATE INDEX "BridgeToken_userId_idx" ON "BridgeToken"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "RotatorDay_date_key" ON "RotatorDay"("date");

-- CreateIndex
CREATE UNIQUE INDEX "RotatorBid_dayId_userId_key" ON "RotatorBid"("dayId", "userId");

-- CreateIndex
CREATE INDEX "RotatorPlacement_date_idx" ON "RotatorPlacement"("date");

-- CreateIndex
CREATE UNIQUE INDEX "RotatorPlacement_userId_partner_key" ON "RotatorPlacement"("userId", "partner");

-- CreateIndex
CREATE UNIQUE INDEX "TrendDay_date_lang_key" ON "TrendDay"("date", "lang");

-- CreateIndex
CREATE INDEX "DoorsSession_gameDate_idx" ON "DoorsSession"("gameDate");

-- CreateIndex
CREATE UNIQUE INDEX "DoorsSession_userId_gameDate_key" ON "DoorsSession"("userId", "gameDate");

-- CreateIndex
CREATE UNIQUE INDEX "DoorsDailySet_gameDate_language_key" ON "DoorsDailySet"("gameDate", "language");

-- CreateIndex
CREATE INDEX "BidPointEvent_userId_idx" ON "BidPointEvent"("userId");

-- CreateIndex
CREATE INDEX "BidPointEvent_kind_refUserId_idx" ON "BidPointEvent"("kind", "refUserId");


-- CreateIndex
CREATE UNIQUE INDEX "KeyAuction_weekKey_key" ON "KeyAuction"("weekKey");

-- CreateIndex
CREATE INDEX "KeyBid_auctionId_points_idx" ON "KeyBid"("auctionId", "points");

-- CreateIndex
CREATE UNIQUE INDEX "KeyBid_auctionId_userId_key" ON "KeyBid"("auctionId", "userId");

-- CreateTable
CREATE TABLE "ClaimRedemption" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "nonce" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "source" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "ClaimRedemption_nonce_key" ON "ClaimRedemption"("nonce");

-- CreateIndex
CREATE INDEX "ClaimRedemption_userId_idx" ON "ClaimRedemption"("userId");

-- CreateTable
CREATE TABLE "AppSetting" (
    "key" TEXT NOT NULL PRIMARY KEY,
    "value" TEXT NOT NULL,
    "updatedAt" DATETIME NOT NULL
);


-- CreateTable
CREATE TABLE "TelegramPairCode" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "usedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TelegramPairCode_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "TelegramPairCode_codeHash_key" ON "TelegramPairCode"("codeHash");

-- CreateIndex
CREATE INDEX "TelegramPairCode_userId_idx" ON "TelegramPairCode"("userId");

-- ─── Clip Factory tables ─────────────────────────────────────────────
-- These nine models were missing from this file: the boot applier
-- creates tables ONLY from schema.sql, so a fresh database had no
-- clip tables at all (existing databases got them from Prisma).
-- CreateTable
CREATE TABLE "ClipPage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "handle" TEXT NOT NULL,
    "niche" TEXT NOT NULL,
    "platforms" TEXT NOT NULL DEFAULT '[]',
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "approvalHours" TEXT,
    "cadence" TEXT NOT NULL DEFAULT '{}',
    "creatorAllow" TEXT NOT NULL DEFAULT '[]',
    "creatorBlock" TEXT NOT NULL DEFAULT '[]',
    "disclosure" TEXT,
    "voiceStyle" TEXT NOT NULL DEFAULT 'captions',
    "archivedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ClipPage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
-- CreateTable
CREATE TABLE "ClipJob" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "pageId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "sourceUrl" TEXT NOT NULL,
    "sourceKind" TEXT NOT NULL,
    "sourceHost" TEXT NOT NULL,
    "clipSeconds" INTEGER NOT NULL DEFAULT 15,
    "hook" TEXT,
    "caption" TEXT,
    "warnings" TEXT NOT NULL DEFAULT '[]',
    "pageUrl" TEXT,
    "mp4Url" TEXT,
    "creditWho" TEXT,
    "creditUrl" TEXT,
    "spoiler" BOOLEAN NOT NULL DEFAULT false,
    "series" TEXT,
    "episode" INTEGER,
    "engineJobId" TEXT,
    "bridgeTokenId" TEXT,
    "fundingLane" TEXT,
    "grantId" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "blockedReason" TEXT,
    "approvedAt" DATETIME,
    "exportedAt" DATETIME,
    "error" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ClipJob_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ClipJob_pageId_fkey" FOREIGN KEY ("pageId") REFERENCES "ClipPage" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
-- CreateTable
CREATE TABLE "ClipCredit" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "clipId" TEXT NOT NULL,
    "who" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ClipCredit_clipId_fkey" FOREIGN KEY ("clipId") REFERENCES "ClipJob" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
-- CreateTable
CREATE TABLE "ClipTakedown" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "creator" TEXT NOT NULL,
    "sourceUrl" TEXT,
    "note" TEXT,
    "requestedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
-- CreateTable
CREATE TABLE "ClipExportToken" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "clipId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "usedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ClipExportToken_clipId_fkey" FOREIGN KEY ("clipId") REFERENCES "ClipJob" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
-- CreateTable
CREATE TABLE "ClipPost" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "clipId" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "externalUrl" TEXT,
    "postedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
-- CreateTable
CREATE TABLE "ClipGameSession" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "pageId" TEXT NOT NULL,
    "floor" INTEGER NOT NULL,
    "bonus" INTEGER NOT NULL DEFAULT 0,
    "briefs" TEXT NOT NULL DEFAULT '[]',
    "round" INTEGER NOT NULL DEFAULT 0,
    "maxRounds" INTEGER NOT NULL DEFAULT 3,
    "seed" INTEGER NOT NULL,
    "chosen" TEXT NOT NULL DEFAULT '[]',
    "status" TEXT NOT NULL DEFAULT 'open',
    "resolvedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
-- CreateTable
CREATE TABLE "ClipCreditGrant" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "spent" INTEGER NOT NULL DEFAULT 0,
    "source" TEXT NOT NULL,
    "label" TEXT,
    "reference" TEXT,
    "expiresAt" DATETIME,
    "spentAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
-- CreateTable
CREATE TABLE "ClipFeedback" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "clipId" TEXT NOT NULL,
    "verdict" TEXT NOT NULL,
    "note" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
-- CreateIndex
CREATE INDEX "ClipPage_userId_idx" ON "ClipPage"("userId");
-- CreateIndex
CREATE INDEX "ClipJob_userId_status_idx" ON "ClipJob"("userId", "status");
-- CreateIndex
CREATE INDEX "ClipJob_pageId_createdAt_idx" ON "ClipJob"("pageId", "createdAt");
-- CreateIndex
CREATE UNIQUE INDEX "ClipCredit_clipId_key" ON "ClipCredit"("clipId");
-- CreateIndex
CREATE INDEX "ClipCredit_userId_idx" ON "ClipCredit"("userId");
-- CreateIndex
CREATE UNIQUE INDEX "ClipTakedown_creator_key" ON "ClipTakedown"("creator");
-- CreateIndex
CREATE UNIQUE INDEX "ClipExportToken_tokenHash_key" ON "ClipExportToken"("tokenHash");
-- CreateIndex
CREATE INDEX "ClipExportToken_clipId_idx" ON "ClipExportToken"("clipId");
-- CreateIndex
CREATE INDEX "ClipPost_userId_postedAt_idx" ON "ClipPost"("userId", "postedAt");
-- CreateIndex
CREATE INDEX "ClipGameSession_userId_status_idx" ON "ClipGameSession"("userId", "status");
-- CreateIndex
CREATE INDEX "ClipCreditGrant_userId_spentAt_idx" ON "ClipCreditGrant"("userId", "spentAt");
-- CreateIndex
CREATE INDEX "ClipFeedback_userId_createdAt_idx" ON "ClipFeedback"("userId", "createdAt");
-- CreateIndex
CREATE UNIQUE INDEX "BidPointEvent_kind_userId_refUserId_key" ON "BidPointEvent"("kind", "userId", "refUserId");

-- CreateTable
CREATE TABLE "TelegramUpdate" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "botSlug" TEXT NOT NULL,
    "updateId" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE INDEX "TelegramUpdate_botSlug_idx" ON "TelegramUpdate"("botSlug");

-- CreateIndex
CREATE UNIQUE INDEX "TelegramUpdate_botSlug_updateId_key" ON "TelegramUpdate"("botSlug", "updateId");

-- CreateTable
CREATE TABLE "PickaphoneSession" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "assignment" JSONB NOT NULL,
    "commitmentHash" TEXT NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'playing',
    "picks" JSONB NOT NULL DEFAULT [],
    "bankedTokens" INTEGER NOT NULL DEFAULT 0,
    "pendingOffer" INTEGER,
    "offers" JSONB NOT NULL DEFAULT [],
    "finalTokens" INTEGER,
    "gensAwarded" INTEGER NOT NULL DEFAULT 0,
    "claimNonce" TEXT,
    "claimToken" TEXT,
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" DATETIME
);

-- CreateTable
CREATE TABLE "PickaphoneEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sessionId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "payload" JSONB,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PickaphoneEvent_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "PickaphoneSession" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "PickaphoneSession_claimNonce_key" ON "PickaphoneSession"("claimNonce");

-- CreateIndex
CREATE INDEX "PickaphoneSession_createdAt_idx" ON "PickaphoneSession"("createdAt");

-- CreateIndex
CREATE INDEX "PickaphoneEvent_sessionId_idx" ON "PickaphoneEvent"("sessionId");

-- CreateIndex
CREATE INDEX "PickaphoneEvent_type_idx" ON "PickaphoneEvent"("type");

-- CreateTable
CREATE TABLE "BtcgameSession" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "assignment" JSONB NOT NULL,
    "commitmentHash" TEXT NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'playing',
    "picks" JSONB NOT NULL DEFAULT [],
    "bankedTokens" INTEGER NOT NULL DEFAULT 0,
    "perks" JSONB NOT NULL DEFAULT [],
    "pendingOffer" INTEGER,
    "offers" JSONB NOT NULL DEFAULT [],
    "finalTokens" INTEGER,
    "gensAwarded" INTEGER NOT NULL DEFAULT 0,
    "claimNonce" TEXT,
    "claimToken" TEXT,
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" DATETIME
);

-- CreateTable
CREATE TABLE "BtcgameEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sessionId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "payload" JSONB,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "BtcgameEvent_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "BtcgameSession" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "BtcgameSession_claimNonce_key" ON "BtcgameSession"("claimNonce");

-- CreateIndex
CREATE INDEX "BtcgameSession_createdAt_idx" ON "BtcgameSession"("createdAt");

-- CreateIndex
CREATE INDEX "BtcgameEvent_sessionId_idx" ON "BtcgameEvent"("sessionId");

-- CreateIndex
CREATE INDEX "BtcgameEvent_type_idx" ON "BtcgameEvent"("type");
