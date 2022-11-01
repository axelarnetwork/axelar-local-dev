import { BCS, HexString } from 'aptos';
import { GatewayData } from '../src/aptos/serializer';

describe('bcs', () => {
    it('should be able to serialize data', () => {
        const gatewayData = new GatewayData({
            chainId: 1,
            commandIds: [
                '0x08a610841e42ceafa9074a7c623c37f0057ce1c1e67f4792a4c6acb44d5d0b18',
                '0x97e1aceef545f7f579b8377c3e9e6ccdf84270d499035959740e46d95e1c4437',
                '0xf072e866c00c195f7571c66209d2a958920bf1d5e1dc7afa7b0c0b7f839556d0',
                '0x37fbee0d425ef0a6d4104fece448f4b4f714859d1070d0af89a9a634b03e1519',
                '0xb945a884a1cb4a01a9a4d702ff552429699fa8c4107212536004e858dc68bbab',
            ],
            commands: ['approveContractCall', 'approveContractCall', 'approveContractCall', 'approveContractCall', 'approveContractCall'],
            params: [
                '0x00000000000000000000000000000000000000000000000000000000000000c000000000000000000000000000000000000000000000000000000000000001000000000000000000000000008d606553c80c1681872b7f15866a538eaf83c3ec603df3b40c824b4ef94dac48670a92578155103818c59de715a0a9fc0103312207c5c7fec5d89634dbf8ac6e65b01e804e1831a387b29430ecd44a55e7bc4de3000000000000000000000000000000000000000000000000000000000000000500000000000000000000000000000000000000000000000000000000000000094176616c616e6368650000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000002a30786136633434613165446242373839384461353335363937614638393732376665453130653938464600000000000000000000000000000000000000000000',
                '0x00000000000000000000000000000000000000000000000000000000000000c000000000000000000000000000000000000000000000000000000000000001000000000000000000000000008d606553c80c1681872b7f15866a538eaf83c3ec27891665c137970a974b0a36f9e7b25baa0e866dddab28bfa92024af79fe98c55bbff4eb1f3593f28955ccab5ebf01ab1cbabb5b57a3d26aa687a50c2a5157cb000000000000000000000000000000000000000000000000000000000000000500000000000000000000000000000000000000000000000000000000000000084d6f6f6e6265616d000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000002a30786534663835323665356464423834306141313138613231623861433436663043383037373344303400000000000000000000000000000000000000000000',
                '0x00000000000000000000000000000000000000000000000000000000000000c000000000000000000000000000000000000000000000000000000000000001000000000000000000000000008d606553c80c1681872b7f15866a538eaf83c3eceff523c9a602f0f591bf92ddd6890b7fae484313a97b5656c9c13d162ed579039b020b909761e59b94c0432aef7d729a714d4e81d5bd6063fb9b074e16c78991000000000000000000000000000000000000000000000000000000000000000600000000000000000000000000000000000000000000000000000000000000084d6f6f6e6265616d000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000002a30786534663835323665356464423834306141313138613231623861433436663043383037373344303400000000000000000000000000000000000000000000',
                '0x00000000000000000000000000000000000000000000000000000000000000c000000000000000000000000000000000000000000000000000000000000001000000000000000000000000008d606553c80c1681872b7f15866a538eaf83c3ec551b018d79e448f4430f2efaa4e2e1059515073bc52bd9df60476e676bc73bcee819a0e97f8a095845a46c45435d4d2ca4b5cb59d5eae2ac66585d4f4d23554e000000000000000000000000000000000000000000000000000000000000000500000000000000000000000000000000000000000000000000000000000000084d6f6f6e6265616d000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000002a30786534663835323665356464423834306141313138613231623861433436663043383037373344303400000000000000000000000000000000000000000000',
                '0x00000000000000000000000000000000000000000000000000000000000000c000000000000000000000000000000000000000000000000000000000000001000000000000000000000000008d606553c80c1681872b7f15866a538eaf83c3ec7b290f1402388d6400c9c4f7113fb11b3e4f819bd0ab28f988d287aafca137fd67fcddb8a729c6c9b45696f9ea2ef9861a913c2f22639b8df0be212429fc6217000000000000000000000000000000000000000000000000000000000000000600000000000000000000000000000000000000000000000000000000000000084d6f6f6e6265616d000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000002a30786534663835323665356464423834306141313138613231623861433436663043383037373344303400000000000000000000000000000000000000000000',
            ],
        });

        const data = gatewayData.serialize(new BCS.Serializer());
        console.log(HexString.fromUint8Array(data).hex());
    });
});