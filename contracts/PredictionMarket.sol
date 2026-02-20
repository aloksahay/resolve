// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

contract PredictionMarket {
    enum Outcome { Pending, Yes, No }

    struct Market {
        uint256 id;
        string question;
        uint256 deadline;
        address creator;
        uint256 yesPool;
        uint256 noPool;
        Outcome outcome;
        bytes32 storageRoot;
    }

    struct Bet {
        uint256 amount;
        bool betYes;
        bool claimed;
    }

    address public oracle;
    uint256 public nextMarketId;

    mapping(uint256 => Market) public markets;
    mapping(uint256 => mapping(address => Bet)) public bets;

    event MarketCreated(uint256 indexed id, string question, uint256 deadline, address creator);
    event BetPlaced(uint256 indexed marketId, address indexed bettor, bool betYes, uint256 amount);
    event MarketResolved(uint256 indexed marketId, Outcome outcome);
    event WinningsClaimed(uint256 indexed marketId, address indexed bettor, uint256 amount);

    modifier onlyOracle() {
        require(msg.sender == oracle, "Only oracle can call this");
        _;
    }

    constructor() {
        oracle = msg.sender;
    }

    function createMarket(
        string calldata question,
        uint256 deadline,
        bytes32 storageRoot
    ) external returns (uint256) {
        require(deadline > block.timestamp, "Deadline must be in the future");

        uint256 id = nextMarketId++;
        markets[id] = Market({
            id: id,
            question: question,
            deadline: deadline,
            creator: msg.sender,
            yesPool: 0,
            noPool: 0,
            outcome: Outcome.Pending,
            storageRoot: storageRoot
        });

        emit MarketCreated(id, question, deadline, msg.sender);
        return id;
    }

    function placeBet(uint256 marketId, bool betYes) external payable {
        Market storage market = markets[marketId];
        require(market.deadline > 0, "Market does not exist");
        require(block.timestamp < market.deadline, "Market deadline passed");
        require(market.outcome == Outcome.Pending, "Market already resolved");
        require(msg.value > 0, "Bet amount must be > 0");
        require(bets[marketId][msg.sender].amount == 0, "Already placed a bet");

        bets[marketId][msg.sender] = Bet({
            amount: msg.value,
            betYes: betYes,
            claimed: false
        });

        if (betYes) {
            market.yesPool += msg.value;
        } else {
            market.noPool += msg.value;
        }

        emit BetPlaced(marketId, msg.sender, betYes, msg.value);
    }

    function resolveMarket(uint256 marketId, bool outcomeYes) external onlyOracle {
        Market storage market = markets[marketId];
        require(market.deadline > 0, "Market does not exist");
        require(market.outcome == Outcome.Pending, "Market already resolved");

        market.outcome = outcomeYes ? Outcome.Yes : Outcome.No;
        emit MarketResolved(marketId, market.outcome);
    }

    function claimWinnings(uint256 marketId) external {
        Market storage market = markets[marketId];
        require(market.outcome != Outcome.Pending, "Market not resolved yet");

        Bet storage bet = bets[marketId][msg.sender];
        require(bet.amount > 0, "No bet placed");
        require(!bet.claimed, "Already claimed");

        bool won = (bet.betYes && market.outcome == Outcome.Yes) ||
                   (!bet.betYes && market.outcome == Outcome.No);
        require(won, "Did not win");

        bet.claimed = true;

        uint256 totalPool = market.yesPool + market.noPool;
        uint256 winningPool = bet.betYes ? market.yesPool : market.noPool;
        uint256 payout = (bet.amount * totalPool) / winningPool;

        (bool sent, ) = msg.sender.call{value: payout}("");
        require(sent, "Transfer failed");

        emit WinningsClaimed(marketId, msg.sender, payout);
    }

    function getMarket(uint256 marketId) external view returns (Market memory) {
        require(markets[marketId].deadline > 0, "Market does not exist");
        return markets[marketId];
    }

    function getMarketCount() external view returns (uint256) {
        return nextMarketId;
    }

    function setStorageRoot(uint256 marketId, bytes32 storageRoot) external onlyOracle {
        markets[marketId].storageRoot = storageRoot;
    }
}
