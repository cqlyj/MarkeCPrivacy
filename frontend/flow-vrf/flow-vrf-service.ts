import { ethers } from "ethers";

// Cadence Arch precompiled contract address (provided by Flow)
const CADENCE_ARCH_ADDRESS = "0x0000000000000000000000010000000000000001";

export interface FlowVRFResult {
  randomness: string;
  requestId: string;
  blockHeight: number;
  timestamp: number;
}

export interface JudgeAssignment {
  projectId: string;
  judgeEmail: string;
  assignedAt: Date;
  vrfRequestId: string;
  randomnessUsed: string;
}

/**
 * Real Flow VRF Service using Cadence Arch precompiled contract
 * Based on Flow's official documentation
 */
export class FlowVRFService {
  private provider: ethers.JsonRpcProvider;
  private wallet: ethers.Wallet;

  constructor(rpcUrl: string, privateKey: string) {
    this.provider = new ethers.JsonRpcProvider(rpcUrl);
    this.wallet = new ethers.Wallet(privateKey, this.provider);
  }

  /**
   * Get randomness from Flow's native VRF using Cadence Arch
   */
  async requestRandomness(): Promise<FlowVRFResult> {
    try {
      // Call the Cadence Arch precompiled contract directly
      const result = await this.provider.call({
        to: CADENCE_ARCH_ADDRESS,
        data: ethers.id("revertibleRandom()").slice(0, 10), // Function selector
      });

      // Decode the uint64 result
      const randomValue = ethers.AbiCoder.defaultAbiCoder().decode(
        ["uint64"],
        result
      )[0];

      // Get current block info
      const block = await this.provider.getBlock("latest");

      return {
        randomness: ethers.toBeHex(randomValue),
        requestId: ethers.hexlify(ethers.randomBytes(8)), // Generate request ID for tracking
        blockHeight: block?.number || 0,
        timestamp: Date.now(),
      };
    } catch (error) {
      console.error("Failed to get randomness from Flow VRF:", error);
      throw new Error(`Flow VRF request failed: ${error}`);
    }
  }

  /**
   * Get multiple random values for complex judge selection
   */
  async getMultipleRandomValues(count: number): Promise<bigint[]> {
    if (count <= 0) throw new Error("Count must be positive");
    if (count > 50) throw new Error("Maximum 50 random values per request");

    const randomValues: bigint[] = [];

    // Each call to Cadence Arch provides fresh randomness
    for (let i = 0; i < count; i++) {
      const result = await this.provider.call({
        to: CADENCE_ARCH_ADDRESS,
        data: ethers.id("revertibleRandom()").slice(0, 10),
      });

      const randomValue = ethers.AbiCoder.defaultAbiCoder().decode(
        ["uint64"],
        result
      )[0];
      randomValues.push(randomValue);
    }

    return randomValues;
  }

  /**
   * Select judges using Flow's VRF for fair randomness
   */
  async selectJudges(
    availableJudges: string[],
    numJudges: number,
    projectId: string
  ): Promise<JudgeAssignment[]> {
    if (numJudges > availableJudges.length) {
      throw new Error("Cannot select more judges than available");
    }

    if (numJudges <= 0) {
      throw new Error("Must select at least one judge");
    }

    // Get VRF randomness for selection
    const vrfResult = await this.requestRandomness();

    // Get additional randomness if needed for multiple selections
    const randomValues =
      numJudges > 1 ? await this.getMultipleRandomValues(numJudges - 1) : [];

    // Add the first randomness to the array
    const allRandomValues = [BigInt(vrfResult.randomness), ...randomValues];

    const selectedJudges: JudgeAssignment[] = [];
    const usedIndices = new Set<number>();

    for (let i = 0; i < numJudges; i++) {
      let judgeIndex: number;
      let attempts = 0;

      // Find an unused judge using the random value
      do {
        const randomValue = allRandomValues[i] + BigInt(attempts);
        judgeIndex = Number(randomValue % BigInt(availableJudges.length));
        attempts++;
      } while (
        usedIndices.has(judgeIndex) &&
        attempts < availableJudges.length * 2
      );

      if (usedIndices.has(judgeIndex)) {
        throw new Error("Failed to select unique judges");
      }

      usedIndices.add(judgeIndex);

      selectedJudges.push({
        projectId,
        judgeEmail: availableJudges[judgeIndex],
        assignedAt: new Date(),
        vrfRequestId: vrfResult.requestId,
        randomnessUsed: ethers.toBeHex(allRandomValues[i]),
      });
    }

    return selectedJudges;
  }

  /**
   * Get random number in a specific range using Flow VRF
   */
  async getRandomInRange(min: number, max: number): Promise<number> {
    if (max < min) throw new Error("Max must be >= min");

    const result = await this.provider.call({
      to: CADENCE_ARCH_ADDRESS,
      data: ethers.id("revertibleRandom()").slice(0, 10),
    });

    const randomValue = ethers.AbiCoder.defaultAbiCoder().decode(
      ["uint64"],
      result
    )[0];
    const range = max - min + 1;

    return Number(randomValue % BigInt(range)) + min;
  }

  /**
   * Check if connected to Flow EVM network
   */
  async validateFlowNetwork(): Promise<boolean> {
    try {
      const network = await this.provider.getNetwork();
      // Flow EVM Testnet: 545, Flow EVM Mainnet: 747
      return network.chainId === 545n || network.chainId === 747n;
    } catch (error) {
      console.error("Failed to validate Flow network:", error);
      return false;
    }
  }

  /**
   * Get network info
   */
  async getNetworkInfo(): Promise<{ chainId: bigint; name: string }> {
    const network = await this.provider.getNetwork();
    return {
      chainId: network.chainId,
      name:
        network.chainId === 545n
          ? "Flow EVM Testnet"
          : network.chainId === 747n
          ? "Flow EVM Mainnet"
          : "Unknown",
    };
  }
}
