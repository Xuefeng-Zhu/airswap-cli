import { ethers } from 'ethers'
import chalk from 'chalk'
import { Command } from '@oclif/command'
import * as utils from '../../lib/utils'
import { printOrder, confirm, cancelled } from '../../lib/prompt'
import * as requests from '../../lib/requests'
import { Validator } from '@airswap/protocols'
import { toDecimalString } from '@airswap/utils'
const Swap = require('@airswap/swap/build/contracts/Swap.json')
const swapDeploys = require('@airswap/swap/deploys.json')
const lightDeploys = require('@airswap/light/deploys.json')

export default class OrderBest extends Command {
  static description = 'get the best available order'
  async run() {
    try {
      const wallet = await utils.getWallet(this)
      const chainId = String((await wallet.provider.getNetwork()).chainId)
      const metadata = await utils.getMetadata(this, chainId)
      const protocol = await utils.getProtocol(this)
      const gasPrice = await utils.getGasPrice(this)
      utils.displayDescription(this, OrderBest.description, chainId)

      const request = await requests.getRequest(wallet, metadata, 'Order')
      this.log()

      let swapContract
      if (request.format === 'light') {
        swapContract = lightDeploys[chainId]
        if (!swapContract) {
          throw `No ${request.format} contract found for the current chain.`
        }
      }

      requests.multiPeerCall(wallet, request.method, request.params, protocol, async (order: any) => {
        if (!order) {
          this.log(chalk.yellow('No valid responses received.\n'))
        } else {
          this.log()
          this.log(chalk.underline.bold(`Signer: ${order.signer.wallet}\n`))
          await printOrder(this, request, order, wallet, metadata)
          const errors = await new Validator(chainId).checkSwap(order)

          if (errors.length) {
            this.log(chalk.yellow('Unable to take (as sender) for the following reasons.\n'))
            for (const e in errors) {
              this.log(`‣ ${Validator.getReason(errors[e])}`)
            }
            this.log()
          } else {
            if (
              await confirm(
                this,
                metadata,
                'swap',
                {
                  swapContract,
                  signerWallet: order.signer.wallet,
                  signerToken: order.signer.token,
                  signerAmount: `${order.signer.amount} (${chalk.cyan(
                    toDecimalString(order.signer.amount, metadata.byAddress[request.signerToken.address].decimals),
                  )})`,
                  senderWallet: `${order.sender.wallet} (${chalk.cyan('You')})`,
                  senderToken: order.sender.token,
                  senderAmount: `${order.sender.amount} (${chalk.cyan(
                    toDecimalString(order.sender.amount, metadata.byAddress[request.senderToken.address].decimals),
                  )})`,
                },
                chainId,
                'take this order',
              )
            ) {
              new ethers.Contract(swapDeploys[chainId], Swap.abi, wallet)
                .swap(order, { gasPrice })
                .then(utils.handleTransaction)
                .catch(utils.handleError)
            }
          }
        }
      })
    } catch (e) {
      cancelled(e)
    }
  }
}
