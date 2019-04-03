import Moleculer from "moleculer";

declare namespace APIGateway {

  namespace UnderlyingService {

    /* Service schema of underlying service. */
    interface ServiceSchema extends Moleculer.ServiceSchema {
      // Metadata of underlying service.
      metadata?: {
        // API Gateway Service will seek only the "api" field of service metadata.
        api?: APIConfig

        // Internal usage to compare api configuration between same named services.
        apiVersion?: string
      } & Moleculer.GenericObject

      actions:  { [key: string]: Action | ActionHandler }
    }

    /* Service actions can be published with api configurations in metadata. */
    interface APIConfig {
      rest?: RESTConfig
      graphql?: GraphQLConfig
    }

    /* Configuration to map service actions to REST endpoints. */
    interface RESTConfig {
      description?: string

      /*
        path: Optional root path for underlying service.

        If service name is "iam.user" and "users" is given as path, "/users/*" will be routed for the service.
        otherwise, "/iam.user/*" will be routed for the service endpoints.
      */
      path?: string

      /*
        aliases: Map actions to REST endpoint. All available alias methods are GET|HEAD|PUT|PATCH|POST|DELETE|(all for empty).

        "POST login": "iam.user.issueToken"
        => POST /users/login        => iam.user.issueToken

        "POST /": "iam.user.create"
        => POST /users              => iam.user.create

        "GET /:id": "iam.user.get"
        => GET /users/:id           => iam.user.get
           :id param will be used to call iam.user.get action.
           Also any params from query string will be merged into the params to call the action.

        "REST /": "iam.user"
        => GET    /users            => iam.user.list
           GET    /users/:id        => iam.user.get
           POST   /users            => iam.user.create
           PUT    /users            => iam.user.update
           DELETE /users/:id        => iam.user.remove
      */
      aliases: {
        [alias: string]: RESTAliasConfig
      }
    }

    /* REST alias mapping configuration. */
    interface RESTAliasConfig {
      description?: string

      /*
        action: The name of action to map to REST alias.
       */
      action: string

      /*
        params: Params key/value map to call the given action.
        All mapping policies will be implicitly tried among same named params without explicit configuration.

        Mapping policies ordered by priority:

          1) Manual value mapping.
          Any values can be mapped manually.
          Useful to protect internal variables from being mapped implicitly.

          "GET /": {
            action: "iam.user.list",
            params: {
              withDisabled: false,
              options: {
                limit: 10,
              }
            }
          }

          2) URL path mapping.
          Aliased URL paths will be mapped.
          Be noted that the type of path values will be always string.

          "GET /:id": {
            action: "iam.user.get",
            params: {
              id: "$.id"
            }
          }

          3) Request body mapping.
          Parsed JSON of request body will be mapped.
          Same named object param from (3) will be recursively merged with (1) Manual value.

          "POST /:id": {
            action: "iam.user.create",
            params: {
              payload: "@.user",
              options: "@.opts"
            }
          }

          4) URL query string mapping.
          Parsed URL query string will be mapped.
            - URL can be extended like "obj[x]=1&obj[y]=2&arr[]=abc&arr[]=def".
            - Be noted that the type of query string values will be always string.
          Same named object param from (4) will be recursively merged with (1) Manual value.

          "GET /:id": {
            action: "iam.user.get",
            params: {
              options: "@.opts",
              filter: "@.filter",
            }
          }

        Type casting:

          Any string value of URL path and query string can be casted to boolean|number types.

          "GET /:id": {
            action: "iam.user.get",
            params: {
              id: "$.id#number",
              withDisabled: "@.disabled#boolean"
            }
          }

          Above configuration will make params like { id: 123, withDisabled: true }

       */
      params?: { [paramName: string]: any }
    }

    /* Configuration to extends GraphQL schema and map service actions to GraphQL schema resolver. */
    interface GraphQLConfig {
      description?: string

      /*
        typeDefs: Either a string or strings which defines the GraphQL schema for the service.

        `
        extend Query {
          user(id: ID!) User!
        }

        type User {
          id: ID!
          email: String!
          posts: [Post!]!
        }

        extend type Post {
           author: User
        }
        `
      */
      typeDefs: string | string[]

      /*
        resolvers: Defines the ways to resolve the given schema.

        "Query.user": {...}
        "User.posts": {...}
        "Post.author": {...}
       */
      resolvers: {
        [fieldName: string]: GraphQLResolverConfig
      },

      /*
        nodeResolvers: Optionally define the ways to resolve 'node(id: "type-name:xxx"): Node!' query for the types which implement Node interface.

        "File": {...}
       */
      nodeResolvers?: {
        [typeName: string]: GraphQLObjectResolverConfig
      },
    }

    /* GraphQL resolver mapping configuration. */
    type GraphQLResolverConfig = GraphQLObjectResolverConfig | GraphQLSubscriptionResolverConfig

    interface GraphQLObjectResolverConfig {
      description?: string

      /*
        action: The name of action to map to resolver.
       */
      action: string

      /*
        params: Params key/value map to call the given action.
        All mapping policies will be implicitly tried among same named params without explicit configuration.

        Mapping policies ordered by priority:

          1) Manual value mapping.
          Any values can be mapped manually.
          Useful to protect internal variables from being mapped implicitly.

          "Mutation.createMyUser": {
            action: "iam.user.create",
            params: {
              input: {
                phone: null,
                disabled: false,
                isAdmin: false,
                my: {
                  role: "member",
                  settings: {
                    notification: false
                  },
                }
              }
            }

          2) Field arguments mapping.
          The field arguments (from request variables) will be mapped.
          Same named object param from (2) will be recursively merged with (1) Manual value.

          "Mutation,createMyUser": {
            action: "iam.user.create",
            params: {
              input: "@.input"
            }
          }

          3) Source object mapping.
          The property of source object will be mapped.
          Same named object param from (3) will be recursively merged with (1) Manual value.

          "User.post": {
            action: "post.get",
            params: {
              userId: "$.id"
            }
          }

          Above configuration will make params like { userId: 'if of the source user object' }

       */
      params?: { [paramName: string]: any }

      /*
        paramsWithBatch: If any param names given, API Gateway will use the batch loader (GraphQL DataLoader) to resolve the given field.
        In this case, the mapped action should be able to serve the request with batched params.

        "Query.user": {
          action: "iam.user.get",
          params: {
            id: "@.id"
          }
          paramsWithBatch: ["id"]
        }

        Then "iam.user.get" action should be able to serve the request with { id: ["user-1", "user-2", ...] } params.

        "User.post": {
          action: "post.get",
          params: {
            userId: "$.id"
          },
          paramsWithBatch: ["userId"]
        }

        In above example, "post.get" action should be able to serve { userId: ["user-1", "user-2", ...] } params.
       */
      paramsWithBatch?: string[]

      /*
        ignoreError: If true, "null" will be returned on error. Not affected on non-nullable fields.
       */
      ignoreError?: boolean
    }

    interface GraphQLSubscriptionSource {
      event: string
      payload: any
      nodeID: string
    }

    interface GraphQLSubscriptionResolverConfig {
      description?: string

      /*
        event: The name of moleculer event name to subscribe.
       */
      event: string

      /*
        filterAction: The name of action to optionally filter the event with payload.
        Given action should return boolean value from { source: GraphQLSubscriptionSource, args: any } params.

        if the filterAction is not given, resolver will always publish events.
       */
      filterAction?: string

      /*
        action: The name of action to call with event payload.

        if the action is not given, resolver will just return the raw event payload.
       */
      action?: string

      /*
        params: Params key/value map to call the given action.

        The mapping mechanism is same with regular resolver.
        But the params "source object"($) notation will be mapped with { eventName, eventPayload } object.

        eg.

        "Subscription.notification": {
          event: "noti.sent",
          action: "noti.get",
          params: {
            id: "$.payload.id",
          },
        }

        somewhere, an event has been emitted as like:

        this.broker.broadcast("noti.sent", { id: "xxx" })


        then the "Subscription.notification" resolver will call "noti.get" with { id: "xxx" } params.
       */
      params?: { [paramName: string]: any }

      ignoreError?: boolean
    }

    /* File from multipart/form-data (REST, GraphQL both) content will be parsed as MultipartFile object in params */
    interface MultipartFile {
      name: string
      buffer: string
      encoding: string
      contentType: string
    }

    /* Service action would get below 'meta' from api gateway. */
    interface ActionContextMeta extends Moleculer.GenericObject {
      api: APIRequestContext
    }

    interface APIRequestContext {
      /* User */
      user: any

      /* Locale */
      locale: string

      /*
        REST request information:

        This field would be filled when action called via REST endpoint.
      */
      rest: {
        headers: { [key: string]: any }
        cookies: { [key: string]: any }
        $response?: RESTResponseConfig
      }

      /*
        GraphQL request information:

        This field would be filled when action called via GraphQL schema.
      */
      graphql?: {
        source: any
        args: any
        context: GraphQLRequestContext
        info: import("graphql").GraphQLResolveInfo
      }
    }

    /*
      HTTP response transformation:

      To transform HTTP response of API Gateway, assign 'ctx.meta.rest' field in action handler.
      This transformation will not be applied when action called via GraphQL schema.
      Be noted that when the action has been called via GraphQL resolver, 'rest' will be override by API Gateway GraphQL service.

      eg. from action definition.

      handler({ meta }) {
        if (meta.rest) {
          // 1) make a redirect response.
          meta.rest.$response = {
            statusCode: 301,
            headers: {
              "Location": "https://google.com",
            },
          };
          return;

          // 2) make a download response.
          meta.rest.$response = {
            headers: {
              "Content-Disposition": "attachment; filename=\"anyFile.pdf\"",
            },
          };
          return fileStream; // ref: https://moleculer.services/docs/0.13/actions.html#Streaming

          // 3) make a HTML document response.
          meta.rest.$response = {
            headers: {
              "Content-Type": "text/html",
            },
          };
          return "<html>....</html>";
        }

        // ...
      }
    */
    interface RESTResponseConfig {
      headers?: { [key: string]: string }
      statusCode?: number
      statusMessage?: string
    }

    // internal usage (it wraps APIRequestContext)
    interface GraphQLRequestContext extends Exclude<APIRequestContext, "graphql"> {
      _moleculerContext: Moleculer.Context
      _extensionStack?: any
    }

    // internal usage (it wraps GraphQLRequestContext)
    interface GraphQLSubscriptionRequestContext {
      connection: {
        context: GraphQLRequestContext
        [key: string]: any
      }
      [key: string]: any
    }

    // internal/client-side usage
    interface GraphQLWebSocketConnectionParams {
      idToken?: string
    }

    interface Action extends Moleculer.Action {
      handler?: ActionHandler;
    }

    type ActionHandler<T = any> = ((ctx: Moleculer.Context<Moleculer.GenericObject, ActionContextMeta>) => PromiseLike<T> | T) & ThisType<Moleculer.Service>;
  }

  // internal usage
  interface APISyncRequest extends Moleculer.GenericObject {
    services: UnderlyingService.ServiceSchema[]
    alwaysPreferLatestService: boolean
  }

  namespace CatalogService {
    /*
      Subscribe reports from API Gateway:

      Subscribe to 'api.catalog.report.<serviceName>' to get messages form API Gateway.

      eg. from service schema.

      events: {
        // listen to messages from API Gateway toward this service
        "api.catalog.report.<serviceName>"(report: CatalogService.ServiceReport) {
          this.logger.info(`[Gateway@${report.gatewayNodeID} => ${report.serviceName}]`, JSON.stringify(report, null, 2));
        },

        // listen to related service messages
        "api.catalog.report.<serviceName>**"(report: CatalogService.ServiceReport) {
          // ...
        },

        // listen to all the messages from API Gateway
        "api.catalog.report.**"(report: CatalogService.ServiceReport) {
          // ...
        },

        // listen to api gateway status messages
        "api.catalog.report.api"(report: CatalogService.ServiceReport) {
          // ...
        },

        // listen to api gateway GraphQL server related messages
        "api.catalog.report.api.graphql"(report: CatalogService.ServiceReport) {
          // ...
        },

        // listen to both
        "api.catalog.report.api**"(report: CatalogService.ServiceReport) {
          // ...
        },
      },
    */
    interface ServiceReport {
      serviceName: string
      gatewayNodeID: string
      messages: any[]
      createdAt: Date

      // prevent message from being published to GraphQL subscription channel.
      $stopPropagation?: boolean
    }
  }
}

export = APIGateway;
